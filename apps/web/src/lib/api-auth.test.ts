// @vitest-environment node
//
// Node, not the project default jsdom: jose's WebCrypto build checks
// `payload instanceof Uint8Array`, and under jsdom the encoder returns a
// Uint8Array from a different realm, so every sign call fails the check.
// Nothing here touches the DOM.
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import type { CryptoKey } from "jose";

const SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;

/**
 * These tests exercise REAL signature verification: a token is signed with a
 * generated ES256 key and `jwtVerify` runs unmocked against the matching
 * public key. Only the network fetch of the keyset is stubbed, so a bad
 * signature, a wrong issuer or an expired token fail the way they would in
 * production rather than the way a mock was told to.
 */
const keyState = vi.hoisted(() => ({
  publicKey: null as unknown,
  wrongPublicKey: null as unknown,
  useWrongKey: false,
}));

vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet: () => async () =>
      keyState.useWrongKey ? keyState.wrongPublicKey : keyState.publicKey,
  };
});

const cacheMocks = vi.hoisted(() => ({
  cacheGetMany: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cacheGetMany: cacheMocks.cacheGetMany,
    cacheSet: cacheMocks.cacheSet,
    cacheDel: cacheMocks.cacheDel,
  };
});

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getSession: authMocks.getSession },
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: authMocks.serviceFrom }),
}));

import {
  requireAuthenticatedSession,
  requireAuthenticatedUser,
  requireAuthenticatedUserWithClaims,
  requireGridmasterSession,
} from "./api-auth";
import { resetRevocationMemo } from "./auth/revocation";
import { resetSupabaseJwksCache } from "./auth/verify-token";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

let privateKey: CryptoKey;
let wrongPrivateKey: CryptoKey;

interface TokenOptions {
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  issuedAt?: number;
  sessionId?: string | null;
  claims?: Record<string, unknown>;
  signWithWrongKey?: boolean;
}

async function signToken(options: TokenOptions = {}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedAt = options.issuedAt ?? nowSeconds;
  const payload: Record<string, unknown> = {
    sub: USER_ID,
    email: "user@example.com",
    role: "authenticated",
    platform_role: "none",
    ...(options.sessionId === null ? {} : { session_id: options.sessionId ?? SESSION_ID }),
    ...options.claims,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(options.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (options.expiresIn ?? 3600))
    .sign(options.signWithWrongKey ? wrongPrivateKey : privateKey);
}

function cookieRequest() {
  return new NextRequest("http://localhost/api/test");
}

function bearerRequest(token: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** No revocation markers present — the ordinary case. */
function noRevocations() {
  cacheMocks.cacheGetMany.mockResolvedValue([null, null]);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  keyState.publicKey = pair.publicKey;

  const wrongPair = await generateKeyPair("ES256", { extractable: true });
  wrongPrivateKey = wrongPair.privateKey as CryptoKey;
  keyState.wrongPublicKey = wrongPair.publicKey;
});

describe("api auth helpers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetRevocationMemo();
    resetSupabaseJwksCache();
    keyState.useWrongKey = false;
    noRevocations();
    authMocks.getSession.mockResolvedValue({
      data: { session: { access_token: await signToken() } },
    });
    authMocks.serviceFrom.mockImplementation((table: string) => {
      if (table !== "profiles" && table !== "organizations") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { deactivated_at: null }, error: null }),
          }),
        }),
      };
    });
  });

  describe("token verification", () => {
    it("rejects a malformed token", async () => {
      const result = await requireAuthenticatedSession(bearerRequest("not-a-jwt"));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("rejects a token signed by the wrong key, with no unverified fallback", async () => {
      const token = await signToken({ signWithWrongKey: true });
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("rejects an expired token", async () => {
      const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
      const token = await signToken({ issuedAt: twoHoursAgo, expiresIn: 3600 });
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("rejects a token from the wrong issuer", async () => {
      const token = await signToken({ issuer: "https://evil.example.com/auth/v1" });
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("rejects a token with the wrong audience", async () => {
      const token = await signToken({ audience: "anon" });
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("accepts a valid token and resolves the user from its claims", async () => {
      const token = await signToken();
      const result = await requireAuthenticatedSession(bearerRequest(token));

      expect("response" in result).toBe(false);
      if (!("response" in result)) {
        expect(result.user.id).toBe(USER_ID);
        expect(result.user.email).toBe("user@example.com");
        expect(result.session.access_token).toBe(token);
      }
    });

    it("makes no network call to Supabase Auth on the happy path", async () => {
      const token = await signToken();
      await requireAuthenticatedSession(bearerRequest(token));
      // The Bearer path shouldn't even read cookies, let alone call getUser.
      expect(authMocks.getSession).not.toHaveBeenCalled();
    });
  });

  describe("transports", () => {
    it("authenticates a Bearer-only request (mobile)", async () => {
      const token = await signToken();
      const result = await requireAuthenticatedUser(bearerRequest(token));
      expect("response" in result).toBe(false);
      if (!("response" in result)) expect(result.user.id).toBe(USER_ID);
    });

    it("authenticates a cookie-only request (web)", async () => {
      const result = await requireAuthenticatedUser(cookieRequest());
      expect(authMocks.getSession).toHaveBeenCalled();
      expect("response" in result).toBe(false);
      if (!("response" in result)) expect(result.user.id).toBe(USER_ID);
    });

    it("rejects a request carrying no token at all", async () => {
      authMocks.getSession.mockResolvedValue({ data: { session: null } });
      const result = await requireAuthenticatedUser(cookieRequest());
      expect("response" in result && result.response.status).toBe(401);
    });
  });

  describe("revocation", () => {
    it("rejects a token whose session has been revoked", async () => {
      // [revokedAfter, revokedSession] — the session marker is present.
      cacheMocks.cacheGetMany.mockResolvedValue([null, Date.now()]);
      const token = await signToken();
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("rejects a token issued before the user's revoke-all watermark", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      // Token minted 10 minutes ago, everything revoked 1 minute ago.
      cacheMocks.cacheGetMany.mockResolvedValue([Date.now() - 60_000, null]);
      const token = await signToken({ issuedAt: nowSeconds - 600 });
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(401);
    });

    it("accepts a token issued after the user's revoke-all watermark", async () => {
      // Watermark 10 minutes old, token minted just now — a fresh sign-in.
      cacheMocks.cacheGetMany.mockResolvedValue([Date.now() - 600_000, null]);
      const token = await signToken();
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result).toBe(false);
    });

    it("fails open when Redis is unavailable", async () => {
      // cacheGetMany returns all-nulls when Redis can't be reached. Treating
      // that as "revoked" would sign out every user during an outage.
      cacheMocks.cacheGetMany.mockResolvedValue([null, null]);
      const token = await signToken();
      const result = await requireAuthenticatedSession(bearerRequest(token));
      expect("response" in result).toBe(false);
    });

    it("does not wait indefinitely on a slow Redis", async () => {
      // A hung lookup must not hold the request open. Redis is a network hop
      // sitting directly in front of every authenticated request.
      cacheMocks.cacheGetMany.mockImplementation(() => new Promise(() => {}));
      const token = await signToken();

      const startedAt = Date.now();
      const result = await requireAuthenticatedSession(bearerRequest(token));

      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect("response" in result).toBe(false);
    });

    it("collapses repeat checks for one session into a single Redis round trip", async () => {
      const token = await signToken();
      await requireAuthenticatedSession(bearerRequest(token));
      await requireAuthenticatedSession(bearerRequest(token));
      await requireAuthenticatedSession(bearerRequest(token));
      expect(cacheMocks.cacheGetMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("claims", () => {
    it("returns the verified JWT payload as claims", async () => {
      const token = await signToken({ claims: { org_id: "org-1", org_role: "admin" } });
      const result = await requireAuthenticatedUserWithClaims(bearerRequest(token));

      expect("response" in result).toBe(false);
      if (!("response" in result)) {
        expect(result.claims.org_id).toBe("org-1");
        expect(result.claims.org_role).toBe("admin");
      }
    });

    it("allows a gridmaster whose JWT platform_role is gridmaster", async () => {
      const token = await signToken({ claims: { platform_role: "gridmaster" } });
      const result = await requireGridmasterSession(bearerRequest(token));

      expect("response" in result).toBe(false);
      if (!("response" in result)) {
        expect(result.user.id).toBe(USER_ID);
      }
    });

    it("rejects a non-gridmaster from a gridmaster-only route", async () => {
      const token = await signToken();
      const result = await requireGridmasterSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(403);
    });
  });
});

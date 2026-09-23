// @vitest-environment node
//
// Node, not the project default jsdom: jose's WebCrypto build checks
// `payload instanceof Uint8Array`, and under jsdom the encoder returns a
// Uint8Array from a different realm, so every sign call fails the check.
// Nothing here touches the DOM.
import { NextRequest, NextResponse } from "next/server";
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
  getUser: vi.fn(),
  serviceFrom: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getSession: authMocks.getSession, getUser: authMocks.getUser },
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
  requireSensitiveActionAuth,
  createTokenScopedClient,
} from "./api-auth";
import { resetRevocationMemo } from "./auth/revocation";
import { resetSupabaseJwksCache } from "./auth/verify-token";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SANDBOX_ORG_ID = "33333333-3333-4333-8333-333333333333";

let privateKey: CryptoKey;
let wrongPrivateKey: CryptoKey;

interface TokenOptions {
  issuer?: string;
  audience?: string;
  expiresIn?: number;
  issuedAt?: number | null;
  sessionId?: string | null;
  claims?: Record<string, unknown>;
  signWithWrongKey?: boolean;
}

async function signToken(options: TokenOptions = {}): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedAt = options.issuedAt === undefined ? nowSeconds : options.issuedAt;
  const payload: Record<string, unknown> = {
    sub: USER_ID,
    email: "user@example.com",
    role: "authenticated",
    platform_role: "none",
    // The access token hook stamps this on every mint (migration 037); an
    // absent claim fails closed since 041, so the default here mirrors a real
    // token rather than a pre-037 one.
    mfa_enrolled: false,
    ...(options.sessionId === null ? {} : { session_id: options.sessionId ?? SESSION_ID }),
    ...options.claims,
  };

  let token = new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(options.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience(options.audience ?? "authenticated");
  if (issuedAt !== null) token = token.setIssuedAt(issuedAt);
  token = token.setExpirationTime((issuedAt ?? nowSeconds) + (options.expiresIn ?? 3600));
  return token.sign(options.signWithWrongKey ? wrongPrivateKey : privateKey);
}

function cookieRequest() {
  return new NextRequest("http://localhost/api/test");
}

function bearerRequest(token: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function sandboxBearerRequest(token: string) {
  const sandboxCookie = encodeURIComponent(
    JSON.stringify({ sandboxOrgId: SANDBOX_ORG_ID, userId: USER_ID, sessionId: SESSION_ID }),
  );
  return new NextRequest("http://localhost/api/test", {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `dubgrid-sandbox=${sandboxCookie}`,
    },
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

it("forwards the user token to real SDK MFA mutations without a stored session", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test-only");
  const fetchMock = vi.fn().mockImplementation(
    async (_input, init) =>
      new Response(
        JSON.stringify(
          init.method === "DELETE"
            ? { id: "factor-1" }
            : {
                id: "factor-1",
                type: "totp",
                totp: { qr_code: "<svg />", secret: "test-only", uri: "otpauth://test" },
              },
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  try {
    const client = createTokenScopedClient("user-session-token");
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp", issuer: "DubGrid" });
    expect(enrolled.error).toBeNull();
    const removed = await client.auth.mfa.unenroll({ factorId: "factor-1" });
    expect(removed.error).toBeNull();
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer user-session-token");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
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
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, factors: [] } },
      error: null,
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
    it.each([
      ["a malformed token", async () => "not-a-jwt"],
      ["a token signed by the wrong key", () => signToken({ signWithWrongKey: true })],
      [
        "an expired token",
        () =>
          signToken({
            issuedAt: Math.floor(Date.now() / 1000) - 7200,
            expiresIn: 3600,
          }),
      ],
      [
        "a token from the wrong issuer",
        () => signToken({ issuer: "https://evil.example.com/auth/v1" }),
      ],
      ["a token with the wrong audience", () => signToken({ audience: "anon" })],
      ["a signed token without its subject", () => signToken({ claims: { sub: undefined } })],
      [
        "a signed token without its authenticated role",
        () => signToken({ claims: { role: "anon" } }),
      ],
      ["a signed token without its session ID", () => signToken({ sessionId: null })],
      ["a signed token with an empty session ID", () => signToken({ sessionId: "" })],
      ["a signed token without its issued-at timestamp", () => signToken({ issuedAt: null })],
    ] satisfies ReadonlyArray<readonly [string, () => Promise<string>]>)(
      "rejects %s before consulting revocation state",
      async (_case, createToken) => {
        const token = await createToken();
        const result = await requireAuthenticatedSession(bearerRequest(token));

        expect("response" in result && result.response.status).toBe(401);
        expect(cacheMocks.cacheGetMany).not.toHaveBeenCalled();
      },
    );

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

    it("uses an explicit Bearer token instead of a conflicting cookie session", async () => {
      const cookieUserId = "33333333-3333-4333-8333-333333333333";
      authMocks.getSession.mockResolvedValue({
        data: { session: { access_token: await signToken({ claims: { sub: cookieUserId } }) } },
      });
      const bearerToken = await signToken();

      const result = await requireAuthenticatedUser(
        new NextRequest("http://localhost/api/test", {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            Cookie: "sb-test-auth-token=conflicting-cookie",
          },
        }),
      );

      expect(authMocks.getSession).not.toHaveBeenCalled();
      expect("response" in result).toBe(false);
      if (!("response" in result)) expect(result.user.id).toBe(USER_ID);
    });

    it("does not fall back to a cookie when an explicit Bearer token is invalid", async () => {
      const result = await requireAuthenticatedUser(
        new NextRequest("http://localhost/api/test", {
          headers: {
            Authorization: "Bearer forged-token",
            Cookie: "sb-test-auth-token=valid-cookie-session",
          },
        }),
      );

      expect(authMocks.getSession).not.toHaveBeenCalled();
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

    it("fails closed when Test Sandbox ownership cannot be verified", async () => {
      authMocks.serviceFrom.mockImplementation((table: string) => {
        if (table === "organizations") {
          return {
            select: () => {
              throw new Error("database unavailable");
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      });
      const token = await signToken({ claims: { org_id: "real-org" } });

      const result = await requireAuthenticatedUserWithClaims(sandboxBearerRequest(token));

      expect("response" in result && result.response.status).toBe(503);
      if ("response" in result) {
        await expect(result.response.json()).resolves.toEqual({
          error: "We couldn't verify your Test Sandbox. Please retry.",
        });
      }
    });

    it("rejects a Test Sandbox cookie stolen from another auth session", async () => {
      const token = await signToken({
        sessionId: "44444444-4444-4444-8444-444444444444",
        claims: { org_id: "real-org" },
      });

      const result = await requireAuthenticatedUserWithClaims(sandboxBearerRequest(token));

      expect("response" in result && result.response.status).toBe(403);
      expect(authMocks.serviceFrom).not.toHaveBeenCalled();
    });

    it("allows a gridmaster whose JWT platform_role is gridmaster", async () => {
      authMocks.serviceFrom.mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  platform_role: "gridmaster",
                  deactivated_at: null,
                  scheduled_deletion_at: null,
                },
                error: null,
              }),
          }),
        }),
      });
      const token = await signToken({ claims: { platform_role: "gridmaster" } });
      const result = await requireGridmasterSession(bearerRequest(token));

      expect("response" in result).toBe(false);
      if (!("response" in result)) {
        expect(result.user.id).toBe(USER_ID);
      }
    });

    it("rejects a stale gridmaster claim when the live profile no longer has that role", async () => {
      const token = await signToken({ claims: { platform_role: "gridmaster" } });
      const result = await requireGridmasterSession(bearerRequest(token));

      expect("response" in result && result.response.status).toBe(403);
    });

    it("rejects a non-gridmaster from a gridmaster-only route", async () => {
      const token = await signToken();
      const result = await requireGridmasterSession(bearerRequest(token));
      expect("response" in result && result.response.status).toBe(403);
    });
  });

  describe("sensitive-action assurance", () => {
    it.each(["cookie", "bearer"] as const)(
      "returns the same safe step-up contract for %s authentication",
      async (transport) => {
        const token = await signToken({
          claims: {
            aal: "aal1",
            amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 301 }],
          },
        });
        if (transport === "cookie") {
          authMocks.getSession.mockResolvedValue({ data: { session: { access_token: token } } });
        }

        const result = await requireSensitiveActionAuth(
          transport === "cookie" ? cookieRequest() : bearerRequest(token),
        );

        expect("response" in result).toBe(true);
        if (!("response" in result)) return;
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toEqual({
          code: "STEP_UP_REQUIRED",
          method: "password",
          error: "Confirm your identity, then try again.",
        });
      },
    );

    it.each([
      {
        label: "password",
        factors: [],
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
      {
        label: "password with Supabase's omitted empty factors",
        factors: undefined,
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
      {
        label: "TOTP",
        factors: [{ factor_type: "totp", status: "verified" }],
        claims: {
          aal: "aal2",
          amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
    ])(
      "accepts recent $label proof selected from live factor state",
      async ({ factors, claims }) => {
        authMocks.getUser.mockResolvedValue({
          data: { user: { id: USER_ID, factors } },
          error: null,
        });
        const token = await signToken({ claims });

        const result = await requireSensitiveActionAuth(bearerRequest(token));

        expect("response" in result).toBe(false);
        if ("response" in result) return;
        expect(result.user.id).toBe(USER_ID);
      },
    );

    it("ignores an untrusted requested method and requires TOTP from live factors", async () => {
      authMocks.getUser.mockResolvedValue({
        data: {
          user: {
            id: USER_ID,
            factors: [{ factor_type: "totp", status: "verified" }],
          },
        },
        error: null,
      });
      const token = await signToken({
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      });
      const req = new NextRequest("http://localhost/api/test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ method: "password" }),
      });

      const result = await requireSensitiveActionAuth(req);

      expect("response" in result).toBe(true);
      if (!("response" in result)) return;
      await expect(result.response.json()).resolves.toEqual({
        code: "STEP_UP_REQUIRED",
        method: "totp",
        error: "Confirm your identity, then try again.",
      });
    });

    it.each([
      {
        label: "live identity lookup fails",
        liveUser: null,
        liveError: { message: "temporarily unavailable" },
        expectedStatus: 503,
      },
      {
        label: "live identity does not match the signed token",
        liveUser: { id: "another-user", factors: [] },
        liveError: null,
        expectedStatus: 401,
      },
      {
        label: "live factor state is malformed",
        liveUser: { id: USER_ID, factors: null },
        liveError: null,
        expectedStatus: 503,
      },
    ])("fails closed when $label", async ({ liveUser, liveError, expectedStatus }) => {
      authMocks.getUser.mockResolvedValue({
        data: { user: liveUser },
        error: liveError,
      });
      const token = await signToken({
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      });

      const result = await requireSensitiveActionAuth(bearerRequest(token));

      expect("response" in result && result.response.status).toBe(expectedStatus);
    });

    it("does not let a route execute its protected operation before assurance passes", async () => {
      const protectedOperation = vi.fn();
      const route = async (req: NextRequest) => {
        const auth = await requireSensitiveActionAuth(req);
        if ("response" in auth) return auth.response;
        protectedOperation(auth.user.id);
        return NextResponse.json({ ok: true });
      };
      const staleToken = await signToken({
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 301 }],
        },
      });

      expect((await route(bearerRequest(staleToken))).status).toBe(403);
      expect(protectedOperation).not.toHaveBeenCalled();

      const freshToken = await signToken({
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      });
      expect((await route(bearerRequest(freshToken))).status).toBe(200);
      expect(protectedOperation).toHaveBeenCalledOnce();
    });
  });
});

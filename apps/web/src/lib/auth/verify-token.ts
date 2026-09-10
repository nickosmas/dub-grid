import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";
import type { NextRequest } from "next/server";
import { getSupabaseUrl } from "@/lib/supabase-keys";

/**
 * Local access-token verification, shared by middleware and API routes.
 *
 * Supabase signs access tokens with an asymmetric key (ES256) and publishes
 * the public half at /auth/v1/.well-known/jwks.json, so "is this token real?"
 * is answerable with a signature check and no network call. That replaces the
 * `supabase.auth.getUser()` round trip every authenticated route used to make.
 *
 * What this deliberately does NOT answer is "is this session still allowed?" —
 * a token stays cryptographically valid until it expires, even after the user
 * signs out. See lib/auth/revocation.ts for that half; callers must do both.
 */

export type VerifiedClaims = JWTPayload & {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
  aal?: string;
  session_id?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  platform_role?: unknown;
  org_id?: unknown;
  org_slug?: unknown;
  org_role?: unknown;
  in_sandbox?: unknown;
};

export interface VerifiedToken {
  userId: string;
  /** Supabase session id — the unit revocation is keyed on. */
  sessionId: string;
  email: string | null;
  /** Token issue time in epoch ms, compared against the per-user revocation watermark. */
  issuedAtMs: number;
  claims: VerifiedClaims;
}

/**
 * JWKS keyset cached at module level. `createRemoteJWKSet` returns a function
 * that lazily fetches, caches, and re-fetches the public keys on its own
 * (including a cooldown so an unknown `kid` can't be used to hammer the
 * endpoint) — so this must not be wrapped in caching of our own.
 *
 * Safe to cache at module scope on Vercel Edge and in Node: it holds only
 * public keys, no env-derived secrets. The cache is per isolate, so a cold
 * isolate pays one JWKS fetch.
 */
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * `process.env` directly rather than `@/lib/env`, matching middleware.ts and
 * supabase-keys.ts: this module is imported by middleware, which runs on the
 * Edge runtime, and pulling the Zod-validated env module in there would drag
 * the whole server env schema onto that path.
 */
export function getSupabaseJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (cachedJwks) return cachedJwks;
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return null;
  cachedJwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  return cachedJwks;
}

/** Test seam: drops the memoized keyset so a test can install its own. */
export function resetSupabaseJwksCache(): void {
  cachedJwks = null;
}

function supabaseIssuer(): string | null {
  const supabaseUrl = getSupabaseUrl();
  return supabaseUrl ? `${supabaseUrl}/auth/v1` : null;
}

/**
 * Pulls the access token off a request.
 *
 * Both transports are supported because the two clients differ: the mobile app
 * sends `Authorization: Bearer` (shared/lib/api.ts), while the web app sends
 * the Supabase SSR auth cookie. Header wins when both are present — an explicit
 * Bearer token is the more specific signal.
 *
 * The cookie form is chunked and base64-prefixed, and parsing it by hand is
 * fragile, so web callers should read the token via the Supabase client's own
 * `getSession()` (a local cookie read) and hand it to `verifyAccessToken`
 * directly rather than relying on this helper.
 */
export function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * Verifies a token's signature and standard claims against Supabase's JWKS.
 *
 * Returns null on any failure. Unlike middleware, there is no fall back to an
 * unverified `decodeJwt` here: middleware can tolerate one because RLS is the
 * real boundary for page navigation and the worst case is a redirect, but a
 * route handler acts on these claims, so an unverified payload is not usable.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedToken | null> {
  const jwks = getSupabaseJwks();
  const issuer = supabaseIssuer();
  if (!jwks || !issuer) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: "authenticated",
    });

    const claims = payload as VerifiedClaims;
    if (
      !claims.sub ||
      claims.role !== "authenticated" ||
      typeof claims.session_id !== "string" ||
      claims.session_id.length === 0 ||
      typeof claims.iat !== "number" ||
      !Number.isFinite(claims.iat)
    ) {
      return null;
    }

    return {
      userId: claims.sub,
      sessionId: claims.session_id,
      email: typeof claims.email === "string" ? claims.email : null,
      issuedAtMs: claims.iat * 1000,
      claims,
    };
  } catch {
    // Bad signature, expired, wrong issuer/audience, unknown kid — all 401.
    return null;
  }
}

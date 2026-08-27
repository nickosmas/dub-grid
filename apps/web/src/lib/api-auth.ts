import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { JwtPayload, Session, User } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getSandboxFromCookie, SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";
import { requireSupabasePublishableKey } from "@/lib/supabase-keys";
import { extractBearerToken, verifyAccessToken } from "@/lib/auth/verify-token";
import type { VerifiedClaims, VerifiedToken } from "@/lib/auth/verify-token";
import { isSessionRevoked } from "@/lib/auth/revocation";

type Claims = JwtPayload & {
  platform_role?: unknown;
  org_id?: unknown;
  org_role?: unknown;
  in_sandbox?: unknown;
};

type AuthResult = { session: Session; user: User } | { response: NextResponse };

type UserAuthResult = { user: User } | { response: NextResponse };

type ClaimsAuthResult =
  { session: Session; user: User; claims: Claims } | { response: NextResponse };

/**
 * A user-scoped Supabase client for this request, honouring whichever
 * transport the caller used.
 *
 * The Bearer header has to be forwarded explicitly. Cookies alone leave the
 * client anonymous for a header-authenticated caller, and every RLS-scoped
 * query and `auth.uid()` RPC made through it then fails — which reads as a
 * permission error rather than an auth one, from a request that authenticated
 * perfectly well.
 */
export function createRequestSupabaseClient(req: NextRequest) {
  const bearer = extractBearerToken(req);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    requireSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handlers use the request-bound response separately.
        },
      },
      ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}),
    },
  );
}

/**
 * Builds a user-scoped Supabase client from a raw access token instead of
 * request cookies — for server contexts (e.g. right after
 * signInWithPassword) that have fresh tokens but no cookie jar yet.
 * `auth.uid()`-scoped RPCs (switch_org, start_trial_for_org) work with this
 * client the same way they do with the cookie-based one.
 */
export function createTokenScopedClient(accessToken: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireSupabasePublishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Builds a fresh, non-cached anon-key client for `.auth.*` calls that must
 * never touch the shared service-role singleton (see supabase-service.ts).
 * signInWithPassword et al mutate the calling client's own session state,
 * which would silently swap getServiceClient()'s Authorization header from
 * service_role to the signed-in user's JWT for the rest of the process.
 */
export function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireSupabasePublishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function expiredSessionResponse(): NextResponse {
  return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
}

/**
 * Rebuilds a `User` from signature-verified JWT claims.
 *
 * Everything the app actually reads off `auth.user` — `id`, `email`,
 * `user_metadata` — is carried in the token, so no call to Supabase Auth is
 * needed to produce it. `created_at` and `last_sign_in_at` are NOT in the
 * token; they are stubbed here, and the one route that displays them
 * (features/mobile/server/routes/profile.ts) reads them from its own query
 * rather than from this object.
 */
function userFromClaims(verified: VerifiedToken): User {
  const { claims } = verified;
  return {
    id: verified.userId,
    email: verified.email ?? undefined,
    phone: typeof claims.phone === "string" ? claims.phone : undefined,
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    role: typeof claims.role === "string" ? claims.role : undefined,
    app_metadata: (claims.app_metadata ?? {}) as User["app_metadata"],
    user_metadata: (claims.user_metadata ?? {}) as User["user_metadata"],
    is_anonymous: claims.is_anonymous === true,
    created_at: "",
  } as User;
}

interface AuthenticatedRequest {
  session: Session;
  user: User;
  verified: VerifiedToken;
}

/**
 * The one place a request is turned into an authenticated caller.
 *
 * Verifies the access token locally against Supabase's JWKS and checks the
 * revocation markers, replacing the `supabase.auth.getUser()` network round
 * trip that every authenticated route used to make. Two transports are
 * accepted: `Authorization: Bearer` (mobile) and the Supabase SSR auth cookie
 * (web).
 *
 * The cookie path still goes through `getSession()`, which is a local cookie
 * read — it only reaches the network when the stored token has expired and
 * needs refreshing, which is exactly the behaviour we want to keep. The token
 * it returns is then verified here; nothing trusts the cookie's contents.
 */
async function authenticateRequest(
  req: NextRequest,
): Promise<AuthenticatedRequest | { response: NextResponse }> {
  const bearer = extractBearerToken(req);
  let session: Session | null = null;
  let accessToken = bearer;

  if (!accessToken) {
    const supabase = createRequestSupabaseClient(req);
    const {
      data: { session: cookieSession },
    } = await supabase.auth.getSession();
    session = cookieSession;
    accessToken = cookieSession?.access_token ?? null;
  }

  if (!accessToken) return { response: expiredSessionResponse() };

  const verified = await verifyAccessToken(accessToken);
  if (!verified) return { response: expiredSessionResponse() };

  if (await isSessionRevoked(verified)) {
    return {
      response: NextResponse.json(
        { error: "This session is no longer valid. Sign in again." },
        { status: 401 },
      ),
    };
  }

  const user = userFromClaims(verified);

  // Bearer callers have no cookie session to hand back. Synthesize the shape
  // callers expect; `access_token` is the only field any of them reads.
  const resolvedSession: Session =
    session ??
    ({
      access_token: accessToken,
      refresh_token: "",
      token_type: "bearer",
      expires_in: 0,
      expires_at: typeof verified.claims.exp === "number" ? verified.claims.exp : undefined,
      user,
    } as Session);

  return { session: resolvedSession, user, verified };
}

export async function requireAuthenticatedSession(req: NextRequest): Promise<AuthResult> {
  const auth = await authenticateRequest(req);
  if ("response" in auth) return auth;
  return { session: auth.session, user: auth.user };
}

export async function requireAuthenticatedUser(req: NextRequest): Promise<UserAuthResult> {
  const auth = await authenticateRequest(req);
  if ("response" in auth) return auth;
  return { user: auth.user };
}

/**
 * Confirms the caller is still live according to Supabase Auth, rather than
 * only according to a token we verified locally.
 *
 * Local verification accepts a token for its full lifetime, so a caller can be
 * up to an hour stale. That is the right trade for ordinary reads and writes,
 * where the revocation markers cover the cases that matter. It is NOT the
 * right trade for irreversible or credential-level actions — account deletion,
 * GDPR erasure, data export, credential and MFA changes, ownership transfer.
 * Those pay the round trip deliberately, by calling this after their normal
 * auth check:
 *
 *   const stale = await requireFreshAuth(req, auth.user.id);
 *   if (stale) return stale;
 *
 * Returns null when the caller is still valid, or the 401 to return when not.
 */
export async function requireFreshAuth(
  req: NextRequest,
  expectedUserId: string,
): Promise<NextResponse | null> {
  const supabase = createRequestSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== expectedUserId) {
    return expiredSessionResponse();
  }

  return null;
}

/**
 * Returns a 403 response if the caller has an active sandbox cookie.
 *
 * Use as the first line of any side-effecting endpoint that talks to
 * external systems (Stripe, email, GDPR erasure) or persists state
 * that's meant to be irreversible. Sandbox users should never be able
 * to trigger emails, charge cards, or schedule data deletion — even
 * if their cookie is stale, we err on the side of "don't fire real
 * side effects when the user thinks they're in a sandbox."
 *
 * Just checks cookie presence — no DB lookup. Cheap to use everywhere.
 */
export function forbidIfSandboxCookie(req: NextRequest): NextResponse | null {
  const cookie = req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  if (!cookie) return null;
  return NextResponse.json(
    {
      error:
        "This action isn't available in sandbox mode. Exit the sandbox to perform it on your real organization.",
    },
    { status: 403 },
  );
}

/** Type guard re-export so callers can use Claims directly. */
export type AuthenticatedClaims = Claims;

export async function requireAuthenticatedUserWithClaims(
  req: NextRequest,
): Promise<ClaimsAuthResult> {
  const result = await authenticateRequest(req);
  if ("response" in result) {
    return result;
  }

  // The verified JWT payload IS the claims — `getClaims()` used to re-derive
  // them over a second round trip, which local verification makes redundant.
  const auth = { session: result.session, user: result.user };
  const claims = result.verified.claims as VerifiedClaims & Claims;

  // ── Sandbox claim override ─────────────────────────────────────────────
  // When the caller has a valid sandbox cookie, rewrite claims.org_id to
  // the sandbox so every downstream endpoint that reads auth.claims.org_id
  // (the universal pattern in this codebase) routes its query/write to the
  // sandbox copy, not the user's real organization. Without this rewrite,
  // any mutating endpoint that reads claims.org_id directly will write to
  // the real org while the user thinks they're in the sandbox.
  //
  // Defense in depth: we re-verify ownership server-side here. The cookie
  // alone is not trusted. Middleware also verifies, and so does
  // /api/test-sandbox; this is the third gate.
  const sandboxCookieValue = req.cookies.get(SANDBOX_COOKIE_NAME)?.value;
  if (sandboxCookieValue) {
    const sb = getSandboxFromCookie(`${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`);
    if (sb && sb.userId === auth.user.id) {
      try {
        const serviceClient = getServiceClient();
        const { data: ownedSandbox } = await serviceClient
          .from("organizations")
          .select("id")
          .eq("id", sb.sandboxOrgId)
          .eq("workspace_kind", "sandbox")
          .eq("sandbox_owner_user_id", auth.user.id)
          .is("archived_at", null)
          .maybeSingle();
        if (ownedSandbox) {
          return {
            ...auth,
            claims: {
              ...claims,
              org_id: ownedSandbox.id,
              // User is super_admin of their own sandbox; widen the role
              // so admin-gated features work inside the sandbox even if
              // the user is a non-admin on their real org. (Menu-level
              // gating already prevents user-tier accounts from entering
              // a sandbox in the first place.)
              org_role: "super_admin",
              // org_slug is display metadata only. Host routing is not used
              // to select organization or sandbox context.
              in_sandbox: true,
            },
          };
        }
      } catch {
        // A sandbox verification outage must never send a request to the
        // caller's real Organization. Some endpoints legitimately use these
        // claims as their effective org context, so falling through here
        // would turn a transient dependency failure into a cross-context
        // write or read. Fail closed and let the client retry instead.
        return {
          response: NextResponse.json(
            { error: "We couldn't verify your Test Sandbox. Please retry." },
            { status: 503 },
          ),
        };
      }
    }
  }

  return { ...auth, claims };
}

export async function requireGridmasterSession(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) {
    return auth;
  }

  if (auth.claims.platform_role !== "gridmaster") {
    return {
      response: NextResponse.json(
        { error: "You don't have permission to use that area." },
        { status: 403 },
      ),
    };
  }

  return { session: auth.session, user: auth.user };
}

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { JwtPayload, Session, User } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getSandboxFromCookie, SANDBOX_COOKIE_NAME } from "@/lib/sandbox-cookie";

type Claims = JwtPayload & {
  platform_role?: unknown;
  org_id?: unknown;
  org_role?: unknown;
  in_sandbox?: unknown;
};

type AuthResult =
  | { session: Session; user: User }
  | { response: NextResponse };

type UserAuthResult =
  | { user: User }
  | { response: NextResponse };

type ClaimsAuthResult =
  | { session: Session; user: User; claims: Claims }
  | { response: NextResponse };

export function createRequestSupabaseClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handlers use the request-bound response separately.
        },
      },
    },
  );
}

export async function requireAuthenticatedSession(
  req: NextRequest,
): Promise<AuthResult> {
  const supabase = createRequestSupabaseClient(req);
  const [
    {
      data: { session },
    },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.auth.getSession(),
    supabase.auth.getUser(),
  ]);

  if (!session?.access_token || !user) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return { session, user };
}

export async function requireAuthenticatedUser(
  req: NextRequest,
): Promise<UserAuthResult> {
  const supabase = createRequestSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Your session expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return { user };
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
  const auth = await requireAuthenticatedSession(req);
  if ("response" in auth) {
    return auth;
  }

  const supabase = createRequestSupabaseClient(req);
  const claimsResult = await supabase.auth.getClaims(auth.session.access_token);
  const claims = claimsResult.data?.claims as Claims | undefined;

  if (claimsResult.error || !claims) {
    return {
      response: NextResponse.json(
        { error: "Your session could not be verified. Please sign in again." },
        { status: 401 },
      ),
    };
  }

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
    const sb = getSandboxFromCookie(
      `${SANDBOX_COOKIE_NAME}=${sandboxCookieValue}`,
    );
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
              // org_slug intentionally NOT changed — keeps user on the
              // real-org subdomain. Some endpoints use slug for routing;
              // exposing the sandbox slug would cause subdomain hops.
              in_sandbox: true,
            },
          };
        }
      } catch {
        // Verification failed transiently — fall through to real claims.
        // Better to under-route to the real org than mis-route on bad
        // state. The user's data is at risk only on writes, and writes
        // already require explicit org_id filtering at every callsite.
      }
    }
  }

  return { ...auth, claims };
}

export async function requireGridmasterSession(
  req: NextRequest,
): Promise<AuthResult> {
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

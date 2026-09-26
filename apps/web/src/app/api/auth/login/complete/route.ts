import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { resolveVerifiedTotpFactorPresence } from "@dubgrid/authz";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireLiveAuthenticatedSession } from "@/lib/api-auth";
import { freshSignInMethod, recordCompletedSignIn } from "@/lib/auth/sign-in-completion";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";

export const dynamic = "force-dynamic";

/**
 * Records a sign-in the browser finished itself as succeeded: a two-factor
 * sign-in once the code is verified and the session has settled into its
 * organization, or the invitation page's password sign-in. Only fresh proof
 * counts, so an older session cannot manufacture a record, and each Auth
 * session is recorded once.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // Live, for the factors: a password counts only on an account without one.
  const auth = await requireLiveAuthenticatedSession(req);
  if ("response" in auth) return auth.response;
  // Already verified by the guard. Read directly rather than through the
  // sandbox-aware claims, so the record names the real organization.
  const claims = decodeJwt(auth.session.access_token);

  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, auth.user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  const hasSecondFactor = resolveVerifiedTotpFactorPresence(auth.user.factors);
  if (hasSecondFactor === null) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  const method = freshSignInMethod(claims, hasSecondFactor);
  if (!method) {
    return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
  }

  await recordCompletedSignIn({
    userId: auth.user.id,
    orgId: typeof claims.org_id === "string" ? claims.org_id : null,
    surface: "web",
    method,
    sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
  });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

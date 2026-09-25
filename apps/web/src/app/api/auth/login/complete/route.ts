import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { hasFreshSecondFactor, recordSecondFactorSignIn } from "@/lib/auth/sign-in-completion";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";

export const dynamic = "force-dynamic";

/**
 * Records a two-factor sign-in as succeeded once the browser has verified the
 * code and settled into its organization. Only a freshly verified second
 * factor counts, so an older session cannot manufacture a sign-in record.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedSession(req);
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

  if (!hasFreshSecondFactor(claims)) {
    return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
  }

  await recordSecondFactorSignIn({
    userId: auth.user.id,
    orgId: typeof claims.org_id === "string" ? claims.org_id : null,
    surface: "web",
  });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

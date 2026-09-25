import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { hasFreshSecondFactor, recordCompletedSignIn } from "@/lib/auth/sign-in-completion";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { requireMobileAuth } from "../auth";

/**
 * Records a mobile two-factor sign-in as succeeded once the code is verified.
 * Only a freshly verified second factor counts.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

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

  if (!hasFreshSecondFactor(auth.claims)) {
    return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
  }

  await recordCompletedSignIn({
    userId: auth.user.id,
    orgId: auth.currentOrg.id,
    surface: "mobile",
    method: "totp",
    sessionId: typeof auth.claims.session_id === "string" ? auth.claims.session_id : null,
  });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

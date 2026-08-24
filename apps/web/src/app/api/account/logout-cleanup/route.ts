import { NextRequest, NextResponse } from "next/server";
import { clearImpersonationSessionsForGridmaster } from "@/features/account/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    // This endpoint only clears gridmaster impersonation sessions. Logout calls
    // it for every user (fire-and-forget), so for non-gridmasters it's an
    // explicit no-op rather than running gridmaster-scoped cleanup as them.
    if (auth.claims.platform_role !== "gridmaster") {
      return NextResponse.json({ success: true });
    }

    await clearImpersonationSessionsForGridmaster(auth.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "account logout cleanup failed");
    return NextResponse.json(
      { error: "We couldn't end those viewing sessions. Try again." },
      { status: 500 },
    );
  }
}

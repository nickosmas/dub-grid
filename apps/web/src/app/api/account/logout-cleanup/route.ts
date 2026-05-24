import { NextRequest, NextResponse } from "next/server";
import { clearImpersonationSessionsForGridmaster } from "@/features/account/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

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
    console.error("account logout cleanup failed", error);
    return NextResponse.json(
      { error: "Failed to clear impersonation sessions" },
      { status: 500 },
    );
  }
}

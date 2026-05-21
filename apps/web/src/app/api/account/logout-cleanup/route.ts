import { NextRequest, NextResponse } from "next/server";
import { clearImpersonationSessionsForGridmaster } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
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

import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json({
      orgId: typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
      isGridmaster: auth.claims.platform_role === "gridmaster",
    });
  } catch (error) {
    console.error("account org context GET failed", error);
    return NextResponse.json({ error: "Failed to load account org context" }, { status: 500 });
  }
}

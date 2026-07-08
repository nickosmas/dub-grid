import { NextRequest, NextResponse } from "next/server";
import { fetchAccountIdentitySnapshot } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await fetchAccountIdentitySnapshot(auth.user.id));
  } catch (error) {
    console.error("account identity GET failed", error);
    return NextResponse.json({ error: "Failed to load account identity" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchAccountIdentitySnapshot } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await fetchAccountIdentitySnapshot(auth.user.id));
  } catch (error) {
    logger.error({ error }, "account identity GET failed");
    return NextResponse.json({ error: "Failed to load account identity" }, { status: 500 });
  }
}

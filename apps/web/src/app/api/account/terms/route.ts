import { NextRequest, NextResponse } from "next/server";
import {
  fetchTermsAcceptanceStatus,
  recordCurrentTermsAcceptance,
} from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    return NextResponse.json(await fetchTermsAcceptanceStatus(auth.user.id));
  } catch (error) {
    console.error("account terms GET failed", error);
    return NextResponse.json(
      { error: "Failed to load terms status" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    await recordCurrentTermsAcceptance(auth.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("account terms POST failed", error);
    return NextResponse.json(
      { error: "Failed to record terms acceptance" },
      { status: 500 },
    );
  }
}

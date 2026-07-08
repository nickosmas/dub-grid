import { NextResponse, type NextRequest } from "next/server";
import { mobileNotificationFacetsSchema } from "@dubgrid/contracts";
import { fetchMobileNotificationFacets, requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    const payload = await fetchMobileNotificationFacets(auth.userClient);
    return NextResponse.json(mobileNotificationFacetsSchema.parse(payload));
  } catch {
    return NextResponse.json(
      { error: "We couldn't load your alert counts right now." },
      { status: 500 },
    );
  }
}

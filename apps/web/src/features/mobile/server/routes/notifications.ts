import { NextResponse, type NextRequest } from "next/server";
import {
  mobileNotificationsQuerySchema,
  mobileNotificationsResponseSchema,
} from "@dubgrid/contracts";
import { loadMobileNotificationsPayload } from "@dubgrid/mobile-api-core";
import {
  fetchMobileNotifications,
  requireMobileAuth,
} from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const queryResult = mobileNotificationsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!queryResult.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const payload = await loadMobileNotificationsPayload(auth, queryResult.data, {
      fetchMobileNotifications,
    });

    return NextResponse.json(mobileNotificationsResponseSchema.parse(payload));
  } catch {
    return NextResponse.json(
      { error: "We couldn't load your mobile notifications right now." },
      { status: 500 },
    );
  }
}

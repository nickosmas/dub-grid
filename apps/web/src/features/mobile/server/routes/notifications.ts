import { NextResponse, type NextRequest } from "next/server";
import {
  mobileNotificationsQuerySchema,
  mobileNotificationsResponseSchema,
} from "@dubgrid/contracts";
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

  const payload = await fetchMobileNotifications(auth.userClient, {
    limit: queryResult.data.limit ?? 20,
    offset: queryResult.data.offset ?? 0,
  });

  return NextResponse.json(mobileNotificationsResponseSchema.parse(payload));
}

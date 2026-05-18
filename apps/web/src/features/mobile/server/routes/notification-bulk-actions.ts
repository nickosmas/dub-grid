import { NextResponse, type NextRequest } from "next/server";
import {
  mobileNotificationBulkBodySchema,
  mobileNotificationBulkResponseSchema,
} from "@dubgrid/contracts";
import {
  bulkMutateMobileNotifications,
  MobileApiRefreshError,
} from "@dubgrid/mobile-api-core";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = mobileNotificationBulkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const payload = await bulkMutateMobileNotifications(auth, parsed.data);
    return NextResponse.json(
      mobileNotificationBulkResponseSchema.parse(payload),
    );
  } catch (error) {
    if (error instanceof MobileApiRefreshError) {
      return NextResponse.json(
        {
          error:
            "We updated those notifications, but couldn't refresh your unread count.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "We couldn't update those notifications." },
      { status: 400 },
    );
  }
}

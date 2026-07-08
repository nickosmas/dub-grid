import { NextResponse, type NextRequest } from "next/server";
import { mobileNotificationReadResponseSchema } from "@dubgrid/contracts";
import {
  markAllMobileNotificationsRead,
  markMobileNotificationRead,
  MobileApiRefreshError,
} from "@dubgrid/mobile-api-core";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    try {
      const payload = await markMobileNotificationRead(auth, id);

      return NextResponse.json(mobileNotificationReadResponseSchema.parse(payload));
    } catch (error) {
      if (error instanceof MobileApiRefreshError) {
        return NextResponse.json(
          {
            error:
              "We updated that notification, but we couldn't refresh your mobile alerts right now.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "We could not update that notification." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "We could not update that notification." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  try {
    try {
      const payload = await markAllMobileNotificationsRead(auth);

      return NextResponse.json(mobileNotificationReadResponseSchema.parse(payload));
    } catch (error) {
      if (error instanceof MobileApiRefreshError) {
        return NextResponse.json(
          {
            error:
              "We updated your notifications, but we couldn't refresh your mobile alerts right now.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "We could not update your notifications." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "We could not update your notifications." }, { status: 500 });
  }
}

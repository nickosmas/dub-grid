import { NextResponse, type NextRequest } from "next/server";
import {
  mobileNotificationSchema,
  mobileNotificationsQuerySchema,
  mobileNotificationsResponseSchema,
} from "@dubgrid/contracts";
import { loadMobileNotificationsPayload } from "@dubgrid/mobile-api-core";
import {
  fetchMobileNotifications,
  requireMobileAuth,
} from "@/features/mobile/server";
import logger from "@/lib/logger";

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

    const notifications = payload.notifications.filter((raw) => {
      const result = mobileNotificationSchema.safeParse(raw);
      if (!result.success) {
        logger.warn(
          { notificationId: (raw as { id?: string }).id, issues: result.error.issues },
          "Dropping mobile notification with unrecognized schema",
        );
      }
      return result.success;
    });

    return NextResponse.json(
      mobileNotificationsResponseSchema.parse({ ...payload, notifications }),
    );
  } catch {
    return NextResponse.json(
      { error: "We couldn't load your mobile notifications right now." },
      { status: 500 },
    );
  }
}

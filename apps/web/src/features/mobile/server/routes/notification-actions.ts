import { NextResponse, type NextRequest } from "next/server";
import { mobileNotificationReadResponseSchema } from "@dubgrid/contracts";
import { requireMobileAuth } from "@/features/mobile/server";

export const dynamic = "force-dynamic";

async function readUnreadCount(auth: Awaited<ReturnType<typeof requireMobileAuth>>) {
  if ("response" in auth) {
    throw new Error("Authentication response passed to readUnreadCount");
  }

  const unreadCountResult = await auth.userClient.rpc(
    "get_unread_notification_count",
  );
  if (unreadCountResult.error) {
    throw unreadCountResult.error;
  }

  return (unreadCountResult.data as number | null) ?? 0;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  const markReadResult = await auth.userClient.rpc("mark_notification_read", {
    p_notification_id: id,
  });

  if (markReadResult.error) {
    return NextResponse.json(
      { error: "We could not update that notification." },
      { status: 400 },
    );
  }

  const unreadCount = await readUnreadCount(auth);

  return NextResponse.json(
    mobileNotificationReadResponseSchema.parse({
      success: true,
      unreadCount,
    }),
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileAuth(req);
  if ("response" in auth) return auth.response;

  const markAllResult = await auth.userClient.rpc("mark_all_notifications_read");
  if (markAllResult.error) {
    return NextResponse.json(
      { error: "We could not update your notifications." },
      { status: 400 },
    );
  }

  const unreadCount = await readUnreadCount(auth);

  return NextResponse.json(
    mobileNotificationReadResponseSchema.parse({
      success: true,
      unreadCount,
    }),
  );
}

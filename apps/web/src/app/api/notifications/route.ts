import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import type { Notification, NotificationPriority, NotificationType } from "@/types";
import { API_ERRORS } from "@dubgrid/client-errors";

const searchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeNotifications: z.enum(["0", "1"]).optional(),
});

const patchSchema = z
  .object({
    notificationId: z.string().uuid().optional(),
    markAll: z.boolean().optional(),
  })
  .refine((value) => value.markAll === true || typeof value.notificationId === "string", {
    message: "notificationId or markAll is required",
  });

export function mapNotificationRow(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: row.type as NotificationType,
    channel: (row.channel as "in_app" | "email") ?? "in_app",
    category: (row.category as string | null) ?? null,
    priority: ((row.priority as string | null) ?? "normal") as NotificationPriority,
    title: row.title as string,
    message: row.message as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    readAt: (row.read_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const parsed = searchSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const includeNotifications = parsed.data.includeNotifications === "1";

    const unreadCountPromise = supabase.rpc("get_unread_notification_count");
    const notificationsPromise = includeNotifications
      ? supabase.rpc("get_notifications", {
          p_limit: parsed.data.limit ?? 20,
          p_offset: parsed.data.offset ?? 0,
        })
      : Promise.resolve({ data: null, error: null });

    const [unreadCountResult, notificationsResult] = await Promise.all([
      unreadCountPromise,
      notificationsPromise,
    ]);

    if (unreadCountResult.error) throw unreadCountResult.error;
    if (notificationsResult.error) throw notificationsResult.error;

    return NextResponse.json({
      unreadCount: (unreadCountResult.data as number | null) ?? 0,
      notifications: includeNotifications
        ? ((notificationsResult.data ?? []) as Record<string, unknown>[]).map(mapNotificationRow)
        : undefined,
    });
  } catch (error) {
    logger.error({ error }, "notifications GET failed");
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    if (parsed.data.markAll) {
      const result = await supabase.rpc("mark_all_notifications_read");
      if (result.error) throw result.error;
      return NextResponse.json({ success: true });
    }

    const result = await supabase.rpc("mark_notification_read", {
      p_notification_id: parsed.data.notificationId,
    });
    if (result.error) throw result.error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "notifications PATCH failed");
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

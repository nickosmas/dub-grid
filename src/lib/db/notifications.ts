import { supabase } from "./shared";
import type { Notification, NotificationType } from "@/types";

export async function fetchNotifications(options?: {
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const { data, error } = await supabase.rpc("get_notifications", {
    p_limit: options?.limit ?? 20,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as NotificationType,
    channel: (row.channel as 'in_app' | 'email') ?? 'in_app',
    category: (row.category as string | null) ?? null,
    title: row.title as string,
    message: row.message as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

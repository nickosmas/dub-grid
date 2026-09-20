import type { Notification, NotificationPriority, NotificationType } from "@/types";

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

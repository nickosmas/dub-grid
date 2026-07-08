"use client";

import type { Notification, NotificationFacets, NotificationPriority } from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface NotificationsResponse {
  unreadCount: number;
  notifications?: Notification[];
}

export interface NotificationCursor {
  createdAt: string;
  id: string;
}

export interface NotificationSearchParams {
  limit?: number;
  cursor?: NotificationCursor | null;
  read?: "unread" | "read" | null;
  category?: string | null;
  priority?: NotificationPriority | null;
  includeArchived?: boolean;
  search?: string | null;
  sort?: "asc" | "desc";
  facets?: boolean;
}

interface SearchResponse {
  notifications: Notification[];
  nextCursor: NotificationCursor | null;
  facets: NotificationFacets | null;
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestNotificationsJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(body?.error, "Notifications request failed."));
  }

  return body as T;
}

export async function fetchNotifications(options?: {
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  params.set("includeNotifications", "1");

  const data = await requestNotificationsJson<NotificationsResponse>(
    `/api/notifications?${params.toString()}`,
  );
  return data.notifications ?? [];
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const data = await requestNotificationsJson<NotificationsResponse>("/api/notifications");
  return data.unreadCount;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await requestNotificationsJson<{ success: true }>("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationId }),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await requestNotificationsJson<{ success: true }>("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markAll: true }),
  });
}

export async function searchNotifications(
  params: NotificationSearchParams,
): Promise<SearchResponse> {
  return requestNotificationsJson<SearchResponse>("/api/notifications/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function fetchNotificationFacets(): Promise<NotificationFacets> {
  return requestNotificationsJson<NotificationFacets>("/api/notifications/facets");
}

async function bulkNotificationAction(
  action: "read" | "unread" | "archive" | "unarchive",
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await requestNotificationsJson<{ success: true }>("/api/notifications/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ids }),
  });
}

export function markNotificationsRead(ids: string[]): Promise<void> {
  return bulkNotificationAction("read", ids);
}

export function markNotificationsUnread(ids: string[]): Promise<void> {
  return bulkNotificationAction("unread", ids);
}

export function archiveNotifications(ids: string[]): Promise<void> {
  return bulkNotificationAction("archive", ids);
}

export function unarchiveNotifications(ids: string[]): Promise<void> {
  return bulkNotificationAction("unarchive", ids);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridmasterNotification, GridmasterPersonNotifications } from "../person-record";

export const RECENT_NOTIFICATION_LIMIT = 50;

type Row = Record<string, unknown>;

/** Read-only: the account's preferences as stored and its latest notifications. */
export async function loadPersonNotifications(
  client: SupabaseClient,
  userId: string,
): Promise<GridmasterPersonNotifications> {
  const [preferenceResult, notificationResult] = await Promise.all([
    client.from("notification_preferences").select("prefs").eq("user_id", userId).maybeSingle(),
    client
      .from("notifications")
      .select(
        "id, org_id, type, channel, category, priority, title, message, metadata, read_at, archived_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_NOTIFICATION_LIMIT),
  ]);
  if (preferenceResult.error) throw preferenceResult.error;
  if (notificationResult.error) throw notificationResult.error;

  const notifications = ((notificationResult.data ?? []) as Row[]).map(
    (row): GridmasterNotification => ({
      id: String(row.id),
      orgId: (row.org_id as string | null) ?? null,
      type: row.type as string,
      channel: (row.channel as string | null) ?? null,
      category: (row.category as string | null) ?? null,
      priority: (row.priority as string | null) ?? null,
      title: (row.title as string | null) ?? "",
      message: (row.message as string | null) ?? "",
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      readAt: (row.read_at as string | null) ?? null,
      archivedAt: (row.archived_at as string | null) ?? null,
      createdAt: row.created_at as string,
    }),
  );
  const prefs = (preferenceResult.data as { prefs?: Record<string, unknown> } | null)?.prefs;
  return { preferences: prefs ?? null, notifications };
}

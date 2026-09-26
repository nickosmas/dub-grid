import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { NotificationPreferenceMap } from "@/features/account/shared/preferences";

export async function fetchNotificationPreferences(
  userId: string,
): Promise<NotificationPreferenceMap | null> {
  const { data, error } = await getServiceClient()
    .from("notification_preferences")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data?.prefs as NotificationPreferenceMap | undefined) ?? null;
}

/**
 * Merges into what is stored, so a save from mobile, which knows only three
 * categories, keeps the ones web adds. Security is never stored: those alerts
 * are always on.
 */
export async function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferenceMap,
): Promise<NotificationPreferenceMap> {
  const stored = (await fetchNotificationPreferences(userId)) ?? {};
  const merged: NotificationPreferenceMap = { ...stored, ...prefs };
  delete merged.security;

  const { error } = await getServiceClient().from("notification_preferences").upsert(
    {
      user_id: userId,
      prefs: merged,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }

  return merged;
}

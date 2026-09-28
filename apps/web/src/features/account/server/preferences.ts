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
 * categories, keeps the ones web adds. The merge runs inside one upsert in the
 * database (072), so a web save and a mobile save at the same moment keep each
 * other's categories (F-20). Security is never stored: those alerts are
 * always on.
 */
export async function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferenceMap,
): Promise<NotificationPreferenceMap> {
  const { data, error } = await getServiceClient().rpc("merge_notification_preferences", {
    p_user_id: userId,
    p_prefs: prefs,
  });

  if (error) {
    throw error;
  }

  return (data as NotificationPreferenceMap | null) ?? {};
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { endUserSession } from "@/lib/auth/revocation";

// Every action is scoped to the person's own rows, so an id from another
// account changes nothing and reads as not found.

/** Signs one session out for good. False when it is not theirs or already gone. */
export async function endPersonSession(
  client: SupabaseClient,
  userId: string,
  sessionRowId: string,
): Promise<boolean> {
  const { data: row, error } = await client
    .from("user_sessions")
    .select("supabase_session_id")
    .eq("id", sessionRowId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return false;
  if (row.supabase_session_id) {
    await endUserSession(userId, row.supabase_session_id as string);
  }
  const { error: deleteError } = await client
    .from("user_sessions")
    .delete()
    .eq("id", sessionRowId)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;
  return true;
}

/** Forgets one known device, so the next sign-in from it alerts again. */
export async function forgetPersonDevice(
  client: SupabaseClient,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("user_known_devices")
    .delete()
    .eq("id", deviceId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Stops push notifications to one device until its app registers again. */
export async function disablePersonPushDevice(
  client: SupabaseClient,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("mobile_device_tokens")
    .update({ disabled_at: now, updated_at: now })
    .eq("id", deviceId)
    .eq("user_id", userId)
    .is("disabled_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Revokes one calendar feed; its URL stops working at once. */
export async function revokePersonCalendarFeed(
  client: SupabaseClient,
  userId: string,
  feedId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("calendar_feed_tokens")
    .update({ revoked_at: now, updated_at: now })
    .eq("id", feedId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

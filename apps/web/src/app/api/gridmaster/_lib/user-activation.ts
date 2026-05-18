import type { SupabaseClient } from "@supabase/supabase-js";

interface SetUserActivationStateOptions {
  serviceClient: SupabaseClient;
  targetUserId: string;
  actorUserId: string;
  deactivate: boolean;
  now?: Date;
}

export async function setUserActivationState({
  serviceClient,
  targetUserId,
  actorUserId,
  deactivate,
  now = new Date(),
}: SetUserActivationStateOptions): Promise<void> {
  const timestamp = now.toISOString();
  const { error: profileError } = await serviceClient
    .from("profiles")
    .update({
      deactivated_at: deactivate ? timestamp : null,
      deactivated_by: deactivate ? actorUserId : null,
      updated_at: timestamp,
    })
    .eq("id", targetUserId);

  if (profileError) {
    throw profileError;
  }

  if (deactivate) {
    const { error: sessionsError } = await serviceClient
      .from("user_sessions")
      .delete()
      .eq("user_id", targetUserId);

    if (sessionsError) {
      throw sessionsError;
    }
  }

  const lockedUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
  const { error: lockError } = await serviceClient
    .from("jwt_refresh_locks")
    .upsert(
      {
        user_id: targetUserId,
        locked_until: lockedUntil,
        reason: "user_activation_change",
      },
      { onConflict: "user_id" },
    );

  if (lockError) {
    throw lockError;
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type SelfDeletionKind = "account" | "gdpr";

/**
 * How long a started deletion may be resumed without the permission check.
 * Long enough to retry a transient Auth failure; short enough that someone who
 * later joins an organization requiring approved deletion is held to it
 * (finding F-31).
 */
export const SELF_DELETION_RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The durable record that a self-service deletion passed every gate and began.
 *
 * Cleanup removes the memberships that authorized the deletion before the Auth
 * user can be deleted, so a transient Auth failure used to leave an identity
 * that could no longer pass the permission check to finish its own deletion.
 * A started record lets that same user resume: the deletion was already
 * authorized, and every other gate is still re-checked on the retry. Only a
 * recent record counts, within `SELF_DELETION_RESUME_WINDOW_MS`.
 */
export async function hasStartedSelfDeletion(
  serviceClient: SupabaseClient,
  userId: string,
  kind: SelfDeletionKind,
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("audit_log")
    .select("id")
    .eq("action", kind === "account" ? "account.deletion_started" : "gdpr.erasure_started")
    .eq("resource_type", "user")
    .eq("resource_id", userId)
    .gte("created_at", new Date(Date.now() - SELF_DELETION_RESUME_WINDOW_MS).toISOString())
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Throws rather than let a deletion begin that could not be resumed. */
export async function recordSelfDeletionStarted(
  serviceClient: SupabaseClient,
  input: { userId: string; email: string | null; orgId: string | null; kind: SelfDeletionKind },
): Promise<void> {
  const record = {
    org_id: input.orgId,
    actor_id: input.userId,
    actor_email: input.email,
    resource_type: "user",
    resource_id: input.userId,
    details: {},
  };
  const { error } = await serviceClient
    .from("audit_log")
    .insert(
      input.kind === "account"
        ? { ...record, action: "account.deletion_started" }
        : { ...record, action: "gdpr.erasure_started" },
    );
  if (error) throw error;
}

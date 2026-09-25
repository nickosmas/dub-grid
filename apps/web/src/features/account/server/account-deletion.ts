import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { revokeAllUserSessions } from "@/lib/auth/revocation";

export interface DeleteUserAccountInput {
  serviceClient: SupabaseClient;
  userId: string;
  actorId: string;
  actorEmail: string | null;
  reason: "self_service" | "admin_approved_request";
  requestId?: string | null;
}

export interface DeleteUserAccountResult {
  success: true;
  cleanupPending: boolean;
  cleanupFailures: string[];
}

/**
 * Rejects a deleted account's access tokens, which web accepts until they
 * expire because it verifies them locally. It runs only after the deletion
 * succeeded, so a failed deletion keeps working tokens for its retry. The
 * watermark write never throws (the cache swallows its own failures); the
 * session-row delete can, and is reported rather than failing the deletion.
 */
export async function rejectDeletedAccountTokens(userId: string, context: string): Promise<void> {
  try {
    await revokeAllUserSessions(userId);
  } catch (error) {
    Sentry.captureException(error, { extra: { userId, context } });
    logger.error({ error, userId, context }, "Failed to reject a deleted account's tokens");
  }
}

export async function deleteUserAccountWithCleanup({
  serviceClient,
  userId,
  actorId,
  actorEmail,
  reason,
  requestId = null,
}: DeleteUserAccountInput): Promise<DeleteUserAccountResult> {
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .single();

  if (profile?.platform_role === "gridmaster") {
    throw new Error("Gridmaster accounts cannot be deleted through this flow.");
  }

  const { data: authUser } = await serviceClient.auth.admin.getUserById(userId);
  const targetEmail = authUser?.user?.email ?? null;

  const { data: memberships } = await serviceClient
    .from("organization_memberships")
    .select("org_id, org_role")
    .eq("user_id", userId);

  for (const membership of memberships ?? []) {
    if ((membership as Record<string, unknown>).org_role !== "super_admin") {
      continue;
    }

    const orgId = (membership as Record<string, unknown>).org_id as string;
    const { count } = await serviceClient
      .from("organization_memberships")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("org_role", "super_admin")
      .is("archived_at", null);

    if ((count ?? 0) <= 1) {
      throw new Error(
        "This user is the only super admin of an organization. Transfer ownership first.",
      );
    }
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw deleteError;
  }
  await rejectDeletedAccountTokens(userId, "account-deletion-token-revocation");

  const cleanupFailures: string[] = [];
  async function runCleanupStep(
    step: string,
    operation: () => Promise<{ error?: unknown } | void>,
  ) {
    try {
      const result = await operation();
      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }
    } catch (error) {
      cleanupFailures.push(step);
      Sentry.captureException(error, {
        extra: { userId, context: "account-deletion-cleanup", step },
      });
      logger.error({ error, userId, step }, "Account deletion cleanup step failed");
    }
  }

  await runCleanupStep("organization_memberships", () =>
    Promise.resolve(serviceClient.from("organization_memberships").delete().eq("user_id", userId)),
  );
  await runCleanupStep("employees", () =>
    Promise.resolve(
      serviceClient.from("employees").update({ user_id: null }).eq("user_id", userId),
    ),
  );
  await runCleanupStep("profiles", () =>
    Promise.resolve(serviceClient.from("profiles").delete().eq("id", userId)),
  );
  await runCleanupStep("notification_preferences", () =>
    Promise.resolve(serviceClient.from("notification_preferences").delete().eq("user_id", userId)),
  );
  await runCleanupStep("user_sessions", () =>
    Promise.resolve(serviceClient.from("user_sessions").delete().eq("user_id", userId)),
  );
  await runCleanupStep("cookie_consents", () =>
    Promise.resolve(serviceClient.from("cookie_consents").delete().eq("user_id", userId)),
  );
  await runCleanupStep("terms_acceptances", () =>
    Promise.resolve(serviceClient.from("terms_acceptances").delete().eq("user_id", userId)),
  );

  try {
    await serviceClient.from("audit_log").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action: "account.deleted",
      resource_type: "user",
      resource_id: userId,
      details: {
        targetEmail,
        reason,
        requestId,
        cleanupFailures,
      },
    });
  } catch (auditError) {
    logger.error({ error: auditError, userId }, "Failed to write account deletion audit log");
  }

  return {
    success: true,
    cleanupPending: cleanupFailures.length > 0,
    cleanupFailures,
  };
}

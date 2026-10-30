import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeAllUserSessions } from "@/lib/auth/revocation";
import { cacheDel, CacheKey } from "@/lib/db/shared";
import logger from "@/lib/logger";

/**
 * What follows an Offboard once the employee row is `removed`: their live
 * tokens are cut and their membership is archived, whoever offboards them
 * (51k). Shared by the web and mobile status routes, bulk, Gridmaster's
 * removal and the daily job that offboards someone after their last day, so
 * all leave the same record. Never throws: the status change has already
 * committed.
 */
export async function endOffboardedAccess(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    empId: string;
    userId: string | null;
    actorId: string | null;
    at: string;
  },
): Promise<void> {
  const { orgId, empId, userId, actorId } = input;
  if (!userId) return;

  // The JWT hook refuses to mint for an offboarded person, but an access
  // token they already hold stays valid until it expires, and API routes
  // verify tokens locally.
  try {
    await revokeAllUserSessions(userId);
  } catch (err) {
    logger.error(
      { error: err, orgId, empId, userId },
      "Failed to revoke sessions after offboarding",
    );
  }

  const { error } = await serviceClient
    .from("organization_memberships")
    .update({ archived_at: input.at, archived_by: actorId })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null);
  if (error) {
    logger.error(
      { error, orgId, empId, userId },
      "Failed to sync organization membership with employee status change",
    );
    return;
  }
  await clearMembershipCaches(orgId);
}

/**
 * What follows a Restore once the employee row is back to `active`: the
 * membership their Offboard archived is reopened with the role it had, whoever
 * restores them (51k), so they can sign in again. Never throws.
 */
export async function reopenRestoredAccess(
  serviceClient: SupabaseClient,
  input: { orgId: string; empId: string; userId: string | null },
): Promise<void> {
  const { orgId, empId, userId } = input;
  if (!userId) return;
  const { error } = await serviceClient
    .from("organization_memberships")
    .update({ archived_at: null, archived_by: null })
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .not("archived_at", "is", null);
  if (error) {
    logger.error(
      { error, orgId, empId, userId },
      "Failed to reopen organization membership after restoring",
    );
    return;
  }
  await clearMembershipCaches(orgId);
}

async function clearMembershipCaches(orgId: string): Promise<void> {
  await cacheDel(
    CacheKey.orgUsers(orgId),
    CacheKey.orgDirectory(orgId),
    CacheKey.employees(orgId),
    CacheKey.allUsers(),
  );
}

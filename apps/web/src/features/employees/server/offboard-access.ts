import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeAllUserSessions } from "@/lib/auth/revocation";
import { cacheDel, CacheKey } from "@/lib/db/shared";
import logger from "@/lib/logger";

/**
 * What follows an Offboard once the employee row is `removed`: their live
 * tokens are cut, and, when whoever offboards them may change organization
 * access (a Super Admin or a Gridmaster), their membership is archived too.
 * Shared by the status route and the daily job that offboards someone after
 * their last day (51g2), so both leave the same record. Never throws: the
 * status change has already committed.
 */
export async function endOffboardedAccess(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    empId: string;
    userId: string | null;
    actorId: string | null;
    endMembership: boolean;
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

  if (!input.endMembership) return;
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
  await cacheDel(
    CacheKey.orgUsers(orgId),
    CacheKey.orgDirectory(orgId),
    CacheKey.employees(orgId),
    CacheKey.allUsers(),
  );
}

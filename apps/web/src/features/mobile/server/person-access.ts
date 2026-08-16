import {
  fetchMobileEmployeeRowById,
  fetchMobileManagementMembershipRowsByUserIds,
  fetchMobilePendingInvitationRowByEmployeeId,
  type MobileInvitationRow,
  type MobileManagementMembershipRow,
} from "@dubgrid/data-access";
import type { MobilePerson } from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToEmployee } from "@/lib/db/mappers";
import { mapEmployeeToMobilePerson } from "./routes/people";

/**
 * One person plus everything their access is made of: the membership that holds
 * their org role and management departments, and any invitation still pending.
 *
 * The person routes each grew their own copy of this and the copies had already
 * drifted — the invitation route's left the management fields off entirely, so
 * every invite response blanked them in the client's cache. The write paths also
 * need the raw rows, not just the mapped person: `updated_at` on each row is
 * what the optimistic-concurrency guards compare against.
 */
export type LoadedMobilePerson = {
  person: MobilePerson;
  userId: string | null;
  membership: MobileManagementMembershipRow | null;
  pendingInvitation: MobileInvitationRow | null;
};

function toMobileOrgRole(value: string | null | undefined): MobilePerson["orgRole"] {
  return value === "super_admin" || value === "admin" || value === "user" ? value : null;
}

export async function loadMobilePersonWithAccess(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeId: string,
): Promise<LoadedMobilePerson | null> {
  const row = await fetchMobileEmployeeRowById(serviceClient, orgId, employeeId);
  if (!row) return null;

  const [pendingInvitation, managementMemberships] = await Promise.all([
    fetchMobilePendingInvitationRowByEmployeeId(serviceClient, orgId, employeeId),
    row.user_id
      ? fetchMobileManagementMembershipRowsByUserIds(serviceClient, orgId, [row.user_id])
      : Promise.resolve([]),
  ]);

  const membership = row.user_id
    ? (managementMemberships.find((candidate) => candidate.user_id === row.user_id) ?? null)
    : null;

  const person = mapEmployeeToMobilePerson({
    ...rowToEmployee(row),
    // A pending invitation's departments stand in until it is accepted, which
    // is when they become the membership's. Same precedence web's directory
    // RPC uses (COALESCE(membership, invitation)).
    managementDepartmentIds: membership?.department_ids ?? pendingInvitation?.department_ids ?? [],
    managementDeptAdminIds: membership?.dept_admin_ids ?? pendingInvitation?.dept_admin_ids ?? [],
    orgRole: toMobileOrgRole(membership?.org_role),
    membershipUpdatedAt: membership?.updated_at ?? null,
    pendingInvitation: pendingInvitation
      ? {
          id: pendingInvitation.id,
          email: pendingInvitation.email,
          expiresAt: pendingInvitation.expires_at,
          updatedAt: pendingInvitation.updated_at ?? null,
          roleToAssign: toMobileOrgRole(pendingInvitation.role_to_assign),
        }
      : null,
  });

  return {
    person,
    userId: row.user_id ?? null,
    membership,
    pendingInvitation,
  };
}

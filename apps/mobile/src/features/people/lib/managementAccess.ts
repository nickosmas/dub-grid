import type { MobilePerson } from "@dubgrid/contracts";

/**
 * The tiers a management grant can carry. Super Admin is only ever offered on
 * the invitation path; changing a linked member's role is the access badge's
 * job, on the person's profile.
 */
export type ManagementAccessRole = "user" | "admin" | "super_admin";

/**
 * Whether this person is on the management roster, or on their way onto it.
 *
 * Departments are the whole test, and they already cover the not-yet-accepted
 * case: the server resolves `managementDepartmentIds` from the membership when
 * there is one and from the pending invitation otherwise. Also testing
 * `pendingInvitation != null` looked like it covered invitees but really said
 * "anyone with any invitation", which is true of a plain staff app invite that
 * carries no departments at all - so those people were offered "Edit Management
 * Access" for access they had never been given.
 */
export function hasManagementAccess(person: MobilePerson): boolean {
  return person.managementDepartmentIds.length > 0;
}

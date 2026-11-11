import type { OrgRole } from "./org-roles";
import { isSelfAction } from "./self-guard";

/**
 * Whether the viewer is offered Move to a new email for this person, on web
 * and in the app. The server applies the same limits: an Admin can't choose
 * who holds another Admin's access, and a person changes their own email on
 * their profile.
 */
export function canOfferMoveToNewEmail({
  employee,
  orgRole,
  currentUserId,
  canGrantElevatedRoles,
}: {
  employee: { userId?: string | null; status?: string | null };
  orgRole: OrgRole | null | undefined;
  currentUserId: string | null | undefined;
  /** A Super Admin or Gridmaster. */
  canGrantElevatedRoles: boolean;
}): boolean {
  return (
    Boolean(employee.userId) &&
    employee.status !== "removed" &&
    !isSelfAction(currentUserId, employee.userId) &&
    (orgRole === "user" || orgRole == null || canGrantElevatedRoles)
  );
}

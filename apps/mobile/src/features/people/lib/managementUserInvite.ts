import type { AdminPermissions } from "@dubgrid/domain";
import type { ManagementAccessRole } from "./managementAccess";

export type ManagementUserInviteDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  orgRole: ManagementAccessRole;
  adminPermissions: AdminPermissions | null;
  managementDepartmentIds: number[];
};

export const EMPTY_MANAGEMENT_USER_INVITE: ManagementUserInviteDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  orgRole: "user",
  adminPermissions: null,
  managementDepartmentIds: [],
};

/** The form opens empty, so anything typed or chosen, the access role included, is work. */
export function managementUserInviteHasChanges(draft: ManagementUserInviteDraft): boolean {
  return (
    draft.firstName !== "" ||
    draft.lastName !== "" ||
    draft.email !== "" ||
    draft.phone !== "" ||
    draft.orgRole !== EMPTY_MANAGEMENT_USER_INVITE.orgRole ||
    draft.adminPermissions !== null ||
    draft.managementDepartmentIds.length > 0
  );
}

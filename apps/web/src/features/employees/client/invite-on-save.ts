import { getOptionalStaffEmailError } from "@dubgrid/contracts";
import { ORG_ROLE_LABELS, ORG_ROLE_PRIVILEGE_ORDER, canGrantOrgRole } from "@dubgrid/domain";
import type { AdminPermissions, AssignableOrganizationRole, Employee, Invitation } from "@/types";

/** "invite" for someone not invited (or whose invite expired); "reinvite" replaces a pending one. */
export type InviteOnSaveKind = "invite" | "reinvite";

/** What the editor asks the host to send once the record is saved. */
export type InviteOnSaveChoice =
  | {
      kind: "invite";
      role: AssignableOrganizationRole;
      /** An Admin's permissions, chosen by a Super Admin; omitted for the standard set. */
      adminPermissions?: AdminPermissions;
    }
  | { kind: "reinvite"; replacing: Invitation };

export interface InviteOnSaveInput {
  hasAccount: boolean;
  savedEmail: string;
  typedEmail: string;
  /** The address of an unexpired pending invitation, if there is one. */
  pendingInvitationEmail: string | null;
  canInvite: boolean;
  inSandbox: boolean;
}

export interface InviteOnSaveOption {
  kind: InviteOnSaveKind;
  /** Ticked only when the email changed in this edit, so an ordinary save never sends mail. */
  defaultChecked: boolean;
}

export const INVITE_ON_SAVE_LABELS: Record<InviteOnSaveKind, string> = {
  invite: "Invite to the app",
  reinvite: "Send a new invitation to this email",
};

export type InviteRoleOption = { value: AssignableOrganizationRole; label: string };

/**
 * The access roles this person's invite can give, least privileged first.
 * Only a Super Admin or Gridmaster gives an elevated tier (F-237), so anyone
 * else gets User alone, and `InviteRoleField` says why instead of a dropdown.
 */
export function inviteRoleOptions(isSuperAdminOrGridmaster: boolean): InviteRoleOption[] {
  const actor = { isSuperAdmin: isSuperAdminOrGridmaster, isGridmaster: false };
  return [...ORG_ROLE_PRIVILEGE_ORDER]
    .reverse()
    .filter((role) => canGrantOrgRole(actor, role))
    .map((role) => ({ value: role, label: ORG_ROLE_LABELS[role] }));
}

const normalize = (email: string) => email.trim().toLowerCase();

/** The invite option the staff editor offers beside the email, or null when it offers none. */
export function describeInviteOnSave(input: InviteOnSaveInput): InviteOnSaveOption | null {
  if (input.hasAccount || !input.canInvite || input.inSandbox) return null;

  const typed = normalize(input.typedEmail);
  if (!typed || getOptionalStaffEmailError(typed)) return null;

  const changed = typed !== normalize(input.savedEmail);
  if (input.pendingInvitationEmail === null) {
    return { kind: "invite", defaultChecked: changed };
  }
  // A pending invitation at the typed address can't be sent again (the create
  // route answers 409); Resend on the invitation card covers it.
  if (!changed || typed === normalize(input.pendingInvitationEmail)) return null;
  return { kind: "reinvite", defaultChecked: true };
}

/** The line under the option, or null when there's nothing to add. */
export function describeInviteOnSaveNote(
  kind: InviteOnSaveKind,
  checked: boolean,
  previousEmail: string,
): string | null {
  if (kind === "invite") {
    return checked ? "We email them a link to join when you save." : null;
  }
  return checked
    ? `We email a new link here when you save. The link sent to ${previousEmail} stops working.`
    : `Their invitation to ${previousEmail} is canceled when you save, because it was for the old email.`;
}

/** What the host's save button reads while saving also sends an invitation. */
export const INVITE_ON_SAVE_BUTTON_LABEL = "Save & invite";

/** The invitation request for a just-saved record; a reinvite keeps the replaced one's access. */
export function invitationRequestForSave(
  saved: Pick<Employee, "id" | "email" | "firstName" | "lastName" | "phone">,
  invite: InviteOnSaveChoice,
  orgId: string,
) {
  const base = { email: saved.email, orgId, employeeId: saved.id };
  if (invite.kind === "reinvite") {
    return {
      ...base,
      role: invite.replacing.roleToAssign,
      firstName: saved.firstName,
      lastName: saved.lastName,
      phone: saved.phone || undefined,
      departmentIds: invite.replacing.departmentIds,
      deptAdminIds: invite.replacing.deptAdminIds,
    };
  }
  return {
    ...base,
    role: invite.role,
    ...(invite.adminPermissions ? { adminPermissions: { ...invite.adminPermissions } } : {}),
  };
}

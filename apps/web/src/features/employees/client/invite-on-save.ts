import { getOptionalStaffEmailError } from "@dubgrid/contracts";
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

/** The access roles an invite can give; only a Super Admin or Gridmaster gives Super Admin. */
export function inviteRoleOptions(
  canGrantSuperAdmin: boolean,
): { value: AssignableOrganizationRole; label: string }[] {
  return [
    { value: "user", label: "User" },
    { value: "admin", label: "Admin" },
    ...(canGrantSuperAdmin ? [{ value: "super_admin" as const, label: "Super Admin" }] : []),
  ];
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

export function inviteOnSaveButtonLabel(sendingInvite: boolean): string {
  return sendingInvite ? "Save & invite" : "Save changes";
}

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

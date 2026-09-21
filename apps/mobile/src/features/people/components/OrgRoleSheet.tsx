import { useMemo, useState } from "react";
import type { MobilePerson } from "@dubgrid/contracts";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { SelectionRow, SelectionSection } from "../../../shared/components/FilterSheet";
import { InlineError } from "../../../shared/components/InlineError";
import { ORG_ROLE_LABELS } from "../lib/orgRoleBadges";

export type OrgRole = "user" | "admin" | "super_admin";

/**
 * Every tier, matching web's Access column, with the one sentence each needs.
 * This sheet changes the role itself, and web has never held Super Admin back
 * from it; an invitation offers the tier only to someone who holds it, which
 * `OrgRoleChoice` filters.
 */
export const ORG_ROLE_OPTIONS: { value: OrgRole; detail: string }[] = [
  { value: "user", detail: "Sees their own schedule and submits requests." },
  { value: "admin", detail: "Manages the schedule and staff, within their permissions." },
  { value: "super_admin", detail: "Full control of this organization, including billing." },
];

export function getPersonOrgRole(person: MobilePerson): OrgRole {
  return person.orgRole ?? person.pendingInvitation?.roleToAssign ?? "user";
}

/** Whose role this sheet is changing, and what holds it. */
export type OrgRoleSubject = {
  currentRole: OrgRole;
  /** Set when the role lives on an invitation, which a change revokes and resends. */
  invitationEmail: string | null;
  displayName: string;
};

export function getPersonOrgRoleSubject(person: MobilePerson): OrgRoleSubject {
  return {
    currentRole: getPersonOrgRole(person),
    invitationEmail: person.userId ? null : (person.pendingInvitation?.email ?? null),
    displayName: `${person.firstName} ${person.lastName}`.trim() || person.email,
  };
}

/**
 * The access level on its own, opened from the Access row at the top of a
 * person's editor and from the roster's actions sheet for someone with no
 * profile to edit.
 * Management departments are not here on purpose: someone can be an Admin
 * without managing a department, and bundling the two is what made this
 * unreachable from the app before - and what put a role control inside the
 * management-access sheet, where it had no business being.
 */
export function OrgRoleSheet({
  visible,
  subject,
  isPending,
  error,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  subject: OrgRoleSubject;
  isPending: boolean;
  /**
   * Why the last change failed. Rendered in the sheet rather than a toast: this
   * is a `<Modal>` with its own native window, so a toast pushed from inside it
   * paints behind and the failure looks like the button doing nothing.
   */
  error?: string | null;
  onDismiss: () => void;
  onSubmit: (orgRole: OrgRole) => Promise<unknown>;
}) {
  const { currentRole, invitationEmail, displayName } = subject;
  const [pendingRole, setPendingRole] = useState<OrgRole | null>(null);

  const confirmation = useMemo(() => {
    const next = pendingRole ?? currentRole;
    if (invitationEmail) {
      return {
        title: "Replace invitation access?",
        body: `Change access from ${ORG_ROLE_LABELS[currentRole]} to ${ORG_ROLE_LABELS[next]}? The current invitation will be revoked and a replacement will be sent to ${invitationEmail}.`,
        confirmLabel: "Revoke and resend",
        confirmTone: "danger" as const,
      };
    }
    return {
      title: "Change role",
      body: `Change this person's role to ${ORG_ROLE_LABELS[next]}? Their access updates immediately.`,
      confirmLabel: "Change role",
      confirmTone: "primary" as const,
    };
  }, [currentRole, invitationEmail, pendingRole]);

  // Inside the sheet, not beside it: iOS refuses a second Modal while one is
  // up, so a sibling confirmation never appeared.
  const confirmationOverlay = (
    <ConfirmationModal
      body={confirmation.body}
      confirmLabel={confirmation.confirmLabel}
      confirmTone={confirmation.confirmTone}
      loading={isPending}
      onCancel={() => setPendingRole(null)}
      onConfirm={() => {
        const next = pendingRole;
        setPendingRole(null);
        return next ? onSubmit(next) : undefined;
      }}
      presentation="inline"
      title={confirmation.title}
      visible={pendingRole !== null}
    />
  );

  return (
    <BottomSheetModal
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions>
            <Button disabled={isPending} label="Cancel" onPress={onDismiss} tone="neutral" />
          </SheetActions>
        </>
      }
      header={<SheetHeader subtitle={displayName} title="App access" />}
      overlay={confirmationOverlay}
      scrollable
      visible={visible}
      onDismiss={onDismiss}
    >
      {/* No header over the list: the sheet's own title is the header, and
          one list under it needs no second name. */}
      <SelectionSection>
        {ORG_ROLE_OPTIONS.map((option) => (
          <SelectionRow
            detail={option.detail}
            key={option.value}
            label={ORG_ROLE_LABELS[option.value]}
            onPress={() => {
              if (isPending || option.value === currentRole) return;
              setPendingRole(option.value);
            }}
            selected={option.value === currentRole}
          />
        ))}
      </SelectionSection>
    </BottomSheetModal>
  );
}

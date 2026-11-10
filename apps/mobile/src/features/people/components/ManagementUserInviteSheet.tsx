import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  getOptionalUsPhoneError,
  getStaffNameError,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  type MobileDepartment,
  type MobileManagementUserInviteBody,
} from "@dubgrid/contracts";
import type { PermissionEditorLabels } from "@dubgrid/authz";
import { getMobileEditorDismissLabel } from "@dubgrid/design-tokens";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import {
  ProfileChoiceGroup,
  ProfilePanel,
  ProfileTextInput,
} from "../../profile/components/ProfilePrimitives";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { mobileSpace } from "../../../shared/theme/tokens";
import {
  EMPTY_MANAGEMENT_USER_INVITE as EMPTY_DRAFT,
  managementUserInviteHasChanges,
  type ManagementUserInviteDraft as InviteDraft,
} from "../lib/managementUserInvite";
import { InvitePermissionsRow } from "./InvitePermissionsRow";
import { OrgRoleChoice } from "./OrgRoleChoice";
import { ADMINISTRATIVE_TEAM_LABELS } from "@dubgrid/domain";

/** Mirrors the email rule the server's zod schema enforces. */
function getEmailError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Email address is required";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? null : "Enter a valid email address";
}

/**
 * Invite someone straight into management: no staff profile, no schedule, just
 * an account scoped to one or more management departments. The staff-side
 * equivalent lives in ManagementAccessSheet, which starts from a person who
 * already exists.
 */
export function ManagementUserInviteSheet({
  visible,
  managementDepartments,
  canGrantElevatedRoles,
  permissionLabels,
  isPending,
  error,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  managementDepartments: MobileDepartment[];
  /** Only a Super Admin may invite another one, or set an Admin's permissions, as on web. */
  canGrantElevatedRoles: boolean;
  permissionLabels: PermissionEditorLabels;
  isPending: boolean;
  /**
   * Why the last submit failed. The sheet stays open on error, and a toast
   * pushed from inside a `<Modal>` renders in the root window behind it.
   */
  error?: string | null;
  onDismiss: () => void;
  onSubmit: (body: MobileManagementUserInviteBody) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<InviteDraft>(EMPTY_DRAFT);
  const [wasVisible, setWasVisible] = useState(visible);
  const [showErrors, setShowErrors] = useState(false);

  // Cleared on each open rather than on close, so the fields are never seen
  // emptying themselves as the sheet slides away.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(EMPTY_DRAFT);
      setShowErrors(false);
    }
  }

  const firstNameError = getStaffNameError(draft.firstName, "First name");
  const lastNameError = getStaffNameError(draft.lastName, "Last name");
  const emailError = getEmailError(draft.email);
  const phoneError = getOptionalUsPhoneError(draft.phone);
  const departmentError =
    draft.managementDepartmentIds.length === 0
      ? `Select at least one ${ADMINISTRATIVE_TEAM_LABELS.singularLower}`
      : null;
  const isValid =
    !firstNameError && !lastNameError && !emailError && !phoneError && !departmentError;
  const hasUnsavedChanges = managementUserInviteHasChanges(draft);
  const setsPermissions = canGrantElevatedRoles && draft.orgRole === "admin";

  // Deliberately no `onDiscard`: the draft is cleared on open, above, so that
  // the fields are never seen emptying themselves as the sheet slides away.
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: isPending,
    title: "Discard this invitation?",
    body: "The invitation you were filling in will be lost.",
    onClose: onDismiss,
  });

  function submit(): Promise<unknown> | undefined {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    return onSubmit({
      firstName: normalizeStaffName(draft.firstName),
      lastName: normalizeStaffName(draft.lastName),
      email: draft.email.trim(),
      phone: normalizeOptionalUsPhone(draft.phone),
      orgRole: draft.orgRole,
      ...(setsPermissions && draft.adminPermissions
        ? { adminPermissions: { ...draft.adminPermissions } }
        : {}),
      managementDepartmentIds: draft.managementDepartmentIds,
    });
  }

  return (
    <BottomSheetModal
      dismissDisabled={isPending}
      hasUnsavedChanges={hasUnsavedChanges}
      // Inside the sheet: iOS refuses a second Modal while one is up.
      overlay={<ConfirmationModal presentation="inline" {...guard.confirmationProps} />}
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions
            primaryAction={
              <Button
                disabled={isPending || managementDepartments.length === 0}
                label="Send invitation"
                loading={isPending}
                onPress={submit}
                tone="primary"
              />
            }
          >
            <Button
              disabled={isPending}
              // Same tri-state the edit surfaces use. Discard clears the
              // draft directly rather than through the guard, whose
              // `onDiscard` would also run on the way out and reintroduce the
              // fields emptying as the sheet slides away.
              label={getMobileEditorDismissLabel({ hasUnsavedChanges })}
              onPress={hasUnsavedChanges ? () => setDraft(EMPTY_DRAFT) : guard.requestClose}
              tone="neutral"
            />
          </SheetActions>
        </>
      }
      header={
        <SheetHeader
          subtitle="They'll get an invitation to join an administrative team, with no schedule profile."
          title="Invite to an administrative team"
        />
      }
      scrollable
      visible={visible}
      onDismiss={guard.requestClose}
    >
      {managementDepartments.length === 0 ? (
        <AppText tone="secondary" variant="body">
          {`There are no ${ADMINISTRATIVE_TEAM_LABELS.pluralLower} yet. Add one in Settings on the web before inviting anyone to one.`}
        </AppText>
      ) : (
        <View style={styles.body}>
          <ProfilePanel>
            <ProfileTextInput
              autoCapitalize="words"
              editable={!isPending}
              error={showErrors ? firstNameError : null}
              label="First name"
              onChangeText={(firstName) => setDraft((current) => ({ ...current, firstName }))}
              value={draft.firstName}
            />
            <ProfileTextInput
              autoCapitalize="words"
              editable={!isPending}
              error={showErrors ? lastNameError : null}
              label="Last name"
              onChangeText={(lastName) => setDraft((current) => ({ ...current, lastName }))}
              value={draft.lastName}
            />
            <ProfileTextInput
              autoCapitalize="none"
              editable={!isPending}
              error={showErrors ? emailError : null}
              keyboardType="email-address"
              autoComplete="email"
              autoCorrect={false}
              label="Email"
              onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
              value={draft.email}
            />
            <ProfileTextInput
              editable={!isPending}
              error={showErrors ? phoneError : null}
              keyboardType="phone-pad"
              autoComplete="tel"
              label="Phone (optional)"
              onChangeText={(phone) => setDraft((current) => ({ ...current, phone }))}
              value={draft.phone}
            />
          </ProfilePanel>

          <OrgRoleChoice
            canGrantElevatedRoles={canGrantElevatedRoles}
            disabled={isPending}
            value={draft.orgRole}
            onChange={(orgRole) => setDraft((current) => ({ ...current, orgRole }))}
          />
          {setsPermissions ? (
            <InvitePermissionsRow
              labels={permissionLabels}
              onChange={(adminPermissions) =>
                setDraft((current) => ({ ...current, adminPermissions }))
              }
              personName={
                [draft.firstName.trim(), draft.lastName.trim()].filter(Boolean).join(" ") ||
                "New person"
              }
              value={draft.adminPermissions}
            />
          ) : null}

          {/* The same ring-and-check list the management-access sheet uses,
              one row per department with its full name. */}
          <ProfileChoiceGroup
            error={showErrors ? departmentError : null}
            items={managementDepartments.map((department) => ({
              id: department.id,
              name: department.name,
              disabled: isPending,
            }))}
            label={ADMINISTRATIVE_TEAM_LABELS.plural}
            selectedIds={draft.managementDepartmentIds}
            onToggle={(id) =>
              setDraft((current) => ({
                ...current,
                managementDepartmentIds: current.managementDepartmentIds.includes(id)
                  ? current.managementDepartmentIds.filter((value) => value !== id)
                  : [...current.managementDepartmentIds, id],
              }))
            }
          />
        </View>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: mobileSpace.lg,
  },
});

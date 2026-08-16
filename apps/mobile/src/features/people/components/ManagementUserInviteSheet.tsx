import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  getOptionalUsPhoneError,
  getStaffNameError,
  normalizeOptionalUsPhone,
  normalizeStaffName,
  type MobileDepartment,
  type MobileManagementUserInviteBody,
} from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { Chip } from "../../../shared/components/Chip";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../shared/components/SegmentedControl";
import { ProfileTextInput } from "../../profile/components/ProfilePrimitives";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import type { ManagementAccessRole } from "./ManagementAccessSheet";

const ROLE_OPTIONS: SegmentedOption<ManagementAccessRole>[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

type InviteDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  orgRole: ManagementAccessRole;
  managementDepartmentIds: number[];
};

const EMPTY_DRAFT: InviteDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  orgRole: "user",
  managementDepartmentIds: [],
};

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
  departmentLabel,
  managementDepartments,
  isPending,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  departmentLabel: string;
  managementDepartments: MobileDepartment[];
  isPending: boolean;
  onDismiss: () => void;
  onSubmit: (body: MobileManagementUserInviteBody) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [draft, setDraft] = useState<InviteDraft>(EMPTY_DRAFT);
  const [wasVisible, setWasVisible] = useState(visible);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
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
      ? `Select at least one management ${departmentLabel.toLowerCase()}`
      : null;
  const isValid =
    !firstNameError && !lastNameError && !emailError && !phoneError && !departmentError;
  const hasUnsavedChanges =
    draft.firstName !== "" ||
    draft.lastName !== "" ||
    draft.email !== "" ||
    draft.phone !== "" ||
    draft.managementDepartmentIds.length > 0;

  function close() {
    setShowDiscardConfirmation(false);
    onDismiss();
  }

  function submit() {
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    onSubmit({
      firstName: normalizeStaffName(draft.firstName),
      lastName: normalizeStaffName(draft.lastName),
      email: draft.email.trim(),
      phone: normalizeOptionalUsPhone(draft.phone),
      orgRole: draft.orgRole,
      managementDepartmentIds: draft.managementDepartmentIds,
    });
  }

  return (
    <>
      <BottomSheetModal
        header={
          <SheetHeader
            subtitle="They'll get an invitation to join management, with no schedule profile."
            title="Invite management user"
          />
        }
        scrollable
        visible={visible}
        onDismiss={() => {
          if (isPending) return;
          if (hasUnsavedChanges) {
            setShowDiscardConfirmation(true);
            return;
          }
          close();
        }}
      >
        {managementDepartments.length === 0 ? (
          <AppText tone="secondary" variant="body">
            {`There are no management ${departmentLabel.toLowerCase()} yet. Add one on the web app, under Settings, before inviting anyone into management.`}
          </AppText>
        ) : (
          <View style={styles.body}>
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
              label="Email"
              onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
              value={draft.email}
            />
            <ProfileTextInput
              editable={!isPending}
              error={showErrors ? phoneError : null}
              keyboardType="phone-pad"
              label="Phone (optional)"
              onChangeText={(phone) => setDraft((current) => ({ ...current, phone }))}
              value={draft.phone}
            />

            <View style={styles.field}>
              <AppText tone="secondary" variant="label">
                Access level
              </AppText>
              <SegmentedControl
                accessibilityLabel="Access level"
                disabled={isPending}
                onChange={(orgRole) => setDraft((current) => ({ ...current, orgRole }))}
                options={ROLE_OPTIONS}
                value={draft.orgRole}
              />
            </View>

            <View style={styles.field}>
              <AppText tone="secondary" variant="label">
                {`Management ${departmentLabel}`}
              </AppText>
              <View style={styles.chipRow}>
                {managementDepartments.map((department) => (
                  <Chip
                    key={department.id}
                    label={department.abbr || department.name}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        managementDepartmentIds: current.managementDepartmentIds.includes(
                          department.id,
                        )
                          ? current.managementDepartmentIds.filter((id) => id !== department.id)
                          : [...current.managementDepartmentIds, department.id],
                      }))
                    }
                    selected={draft.managementDepartmentIds.includes(department.id)}
                  />
                ))}
              </View>
              {showErrors && departmentError ? (
                <AppText tone="danger" variant="meta">
                  {departmentError}
                </AppText>
              ) : null}
            </View>
          </View>
        )}

        <SheetActions>
          <Button
            disabled={isPending || managementDepartments.length === 0}
            label="Send Invitation"
            loading={isPending}
            onPress={submit}
            tone="primary"
          />
          <Button
            disabled={isPending}
            label="Cancel"
            onPress={() => (hasUnsavedChanges ? setShowDiscardConfirmation(true) : close())}
            tone="neutral"
          />
        </SheetActions>
      </BottomSheetModal>

      <ConfirmationModal
        body="The invitation you were filling in will be lost."
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscardConfirmation(false)}
        onConfirm={close}
        title="Discard this invitation?"
        visible={showDiscardConfirmation}
      />
    </>
  );
}

const createStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    body: {
      gap: mobileSpace.lg,
    },
    field: {
      gap: mobileSpace.sm,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.xs,
    },
  });

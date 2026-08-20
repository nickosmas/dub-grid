import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileDepartment, MobilePerson } from "@dubgrid/contracts";
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
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { MANAGEMENT_DEPARTMENT_LABELS } from "../../../shared/lib/departments";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../../../shared/theme/tokens";

export type ManagementAccessRole = "user" | "admin" | "super_admin";

export type ManagementAccessDraft = {
  orgRole: ManagementAccessRole;
  managementDepartmentIds: number[];
};

/**
 * Super Admin is offered only where it can actually be granted. On web that is
 * the invitation path: changing a linked member's role to Super Admin is a
 * different, heavier operation than this sheet is for.
 */
const BASE_ROLE_OPTIONS: SegmentedOption<ManagementAccessRole>[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function getManagementAccessDraft(person: MobilePerson): ManagementAccessDraft {
  return {
    orgRole: person.orgRole ?? person.pendingInvitation?.roleToAssign ?? "user",
    managementDepartmentIds: [...person.managementDepartmentIds],
  };
}

export function hasManagementAccess(person: MobilePerson): boolean {
  return person.managementDepartmentIds.length > 0 || person.pendingInvitation != null;
}

/**
 * Grant, edit or revoke management access for someone who already has a staff
 * profile. Which write the server performs (membership update vs invitation)
 * follows from whether they have an account, so this sheet doesn't decide it —
 * it only ever sends a role and a set of departments.
 */
export function ManagementAccessSheet({
  visible,
  person,
  managementDepartments,
  isPending,
  onDismiss,
  onSubmit,
  onRemove,
}: {
  visible: boolean;
  person: MobilePerson;
  managementDepartments: MobileDepartment[];
  isPending: boolean;
  onDismiss: () => void;
  onSubmit: (draft: ManagementAccessDraft) => void;
  onRemove: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const [baseline, setBaseline] = useState<ManagementAccessDraft>(() =>
    getManagementAccessDraft(person),
  );
  const [draft, setDraft] = useState<ManagementAccessDraft>(baseline);
  const [wasVisible, setWasVisible] = useState(visible);
  const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);

  // Reseed on open rather than on every `person` identity change: a background
  // refetch hands down a new object, and keying off that would wipe whatever
  // the user had half-typed into an open sheet. Adjusted during render, not in
  // an effect, so the first painted frame already shows the right values.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const next = getManagementAccessDraft(person);
      setBaseline(next);
      setDraft(next);
    }
  }

  const isEditing = hasManagementAccess(person);
  // Super Admin is assignable only while the person is still being invited —
  // once they have an account the role is theirs to change elsewhere.
  const roleOptions: SegmentedOption<ManagementAccessRole>[] = person.userId
    ? BASE_ROLE_OPTIONS
    : [...BASE_ROLE_OPTIONS, { value: "super_admin", label: "Super Admin" }];

  const hasUnsavedChanges =
    draft.orgRole !== baseline.orgRole ||
    !sameIds(draft.managementDepartmentIds, baseline.managementDepartmentIds);
  // Dirtiness is part of it, not just validity: a Save that is live on an
  // untouched sheet invites a no-op write, and the same `hasUnsavedChanges`
  // already decides whether closing asks — so the button and the discard
  // prompt can never disagree about whether there is anything to save.
  const canSubmit =
    !isPending &&
    hasUnsavedChanges &&
    draft.managementDepartmentIds.length > 0 &&
    managementDepartments.length > 0;

  function toggleDepartment(departmentId: number) {
    setDraft((current) => ({
      ...current,
      managementDepartmentIds: current.managementDepartmentIds.includes(departmentId)
        ? current.managementDepartmentIds.filter((id) => id !== departmentId)
        : [...current.managementDepartmentIds, departmentId],
    }));
  }

  // Every way out funnels through here, so an edit in progress asks before it
  // is thrown away rather than vanishing on an outside tap.
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: isPending,
    body: "Your changes to their management access will be lost.",
    onDiscard: () => setDraft(baseline),
    onClose: onDismiss,
  });

  return (
    <>
      <BottomSheetModal
        header={
          <SheetHeader
            subtitle={`${person.firstName} ${person.lastName}`.trim() || person.email}
            title={isEditing ? "Edit management access" : "Add to management"}
          />
        }
        scrollable
        visible={visible}
        onDismiss={guard.requestClose}
      >
        {managementDepartments.length === 0 ? (
          <AppText tone="secondary" variant="body">
            {`There are no ${MANAGEMENT_DEPARTMENT_LABELS.pluralLower} yet. Add one on the web app, under Settings, before granting management access.`}
          </AppText>
        ) : (
          <View style={styles.body}>
            <View style={styles.field}>
              <AppText tone="secondary" variant="label">
                Access level
              </AppText>
              <SegmentedControl
                accessibilityLabel="Access level"
                disabled={isPending}
                onChange={(orgRole) => setDraft((current) => ({ ...current, orgRole }))}
                options={roleOptions}
                value={draft.orgRole}
              />
            </View>

            <View style={styles.field}>
              <AppText tone="secondary" variant="label">
                {MANAGEMENT_DEPARTMENT_LABELS.plural}
              </AppText>
              <View style={styles.chipRow}>
                {managementDepartments.map((department) => (
                  <Chip
                    key={department.id}
                    label={department.abbr || department.name}
                    onPress={() => toggleDepartment(department.id)}
                    selected={draft.managementDepartmentIds.includes(department.id)}
                  />
                ))}
              </View>
              {draft.managementDepartmentIds.length === 0 ? (
                <AppText tone="danger" variant="meta">
                  {`Select at least one ${MANAGEMENT_DEPARTMENT_LABELS.singularLower}`}
                </AppText>
              ) : null}
            </View>

            {!person.userId ? (
              <AppText tone="secondary" variant="meta">
                {person.email
                  ? `An invitation will be sent to ${person.email}.`
                  : "Add an email address to this staff profile before inviting them."}
              </AppText>
            ) : null}
          </View>
        )}

        <SheetActions>
          {/* One label for both branches, as on web. "Send Invitation" would
              also collide with the staff-invitation action on the page behind
              this sheet, which does something else entirely. */}
          <Button
            disabled={!canSubmit}
            label="Save Access"
            loading={isPending}
            loadingLabel="Saving"
            onPress={() => onSubmit(draft)}
            tone="primary"
          />
          {isEditing ? (
            <Button
              disabled={isPending}
              label="Remove from Management"
              onPress={() => setShowRemoveConfirmation(true)}
              tone="danger"
            />
          ) : null}
          <Button disabled={isPending} label="Cancel" onPress={guard.requestClose} tone="neutral" />
        </SheetActions>
      </BottomSheetModal>

      <ConfirmationModal {...guard.confirmationProps} />

      <ConfirmationModal
        body="They'll come off the management roster. Their staff profile and schedule stay exactly as they are."
        confirmLabel="Remove Access"
        confirmPendingLabel="Removing"
        confirmTone="danger"
        loading={isPending}
        onCancel={() => setShowRemoveConfirmation(false)}
        onConfirm={() => {
          setShowRemoveConfirmation(false);
          onRemove();
        }}
        title="Remove management access?"
        visible={showRemoveConfirmation}
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

import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileDepartment, MobileManagementUser } from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
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
import type { ManagementAccessRole } from "../lib/managementAccess";

type Draft = {
  orgRole: ManagementAccessRole;
  managementDepartmentIds: number[];
};

const BASE_ROLE_OPTIONS: SegmentedOption<ManagementAccessRole>[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABELS: Record<ManagementAccessRole, string> = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Edit an existing roster member's role and departments. The staff-side sheet
 * (ManagementAccessSheet) works from a MobilePerson and can also grant access
 * for the first time; this one only ever edits someone already on the roster,
 * who may have no staff profile at all.
 */
export function ManagementUserAccessSheet({
  visible,
  managementUser,
  managementDepartments,
  isPending,
  error,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  managementUser: MobileManagementUser;
  managementDepartments: MobileDepartment[];
  isPending: boolean;
  /**
   * Why the last submit failed. The sheet stays open on error, and a toast
   * pushed from inside a `<Modal>` renders in the root window behind it.
   */
  error?: string | null;
  onDismiss: () => void;
  onSubmit: (draft: Draft) => Promise<unknown>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  function seed(): Draft {
    return {
      orgRole: managementUser.orgRole ?? "user",
      managementDepartmentIds: [...managementUser.managementDepartmentIds],
    };
  }

  const [baseline, setBaseline] = useState<Draft>(seed);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [wasVisible, setWasVisible] = useState(visible);
  const [pendingAccessChange, setPendingAccessChange] = useState<Draft | null>(null);

  // Reseeded on open, not on every roster refetch, so a background refresh
  // can't overwrite what the user is part-way through choosing.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const next = seed();
      setBaseline(next);
      setDraft(next);
    }
  }

  // A pending invitation can still be re-pointed at Super Admin; an existing
  // account's role change at that tier is a heavier operation than this sheet.
  const roleOptions: SegmentedOption<ManagementAccessRole>[] =
    managementUser.source === "pending_invite"
      ? [...BASE_ROLE_OPTIONS, { value: "super_admin", label: "Super Admin" }]
      : BASE_ROLE_OPTIONS;

  const hasUnsavedChanges =
    draft.orgRole !== baseline.orgRole ||
    !sameIds(draft.managementDepartmentIds, baseline.managementDepartmentIds);
  // Dirtiness is part of it, not just validity: a Save that is live on an
  // untouched sheet invites a no-op write, and the same `hasUnsavedChanges`
  // already decides whether closing asks — so the button and the discard
  // prompt can never disagree about whether there is anything to save.
  const canSubmit = !isPending && hasUnsavedChanges && draft.managementDepartmentIds.length > 0;

  // Every way out funnels through here, the Cancel button included — it used to
  // close straight through, so the one exit the user took deliberately was the
  // one that dropped their edit without asking.
  const guard = useUnsavedChangesGuard({
    isDirty: hasUnsavedChanges,
    disabled: isPending,
    body: "Your changes to their management access will be lost.",
    onDiscard: () => setDraft(baseline),
    onClose: onDismiss,
  });

  function submitDraft() {
    if (managementUser.source === "pending_invite" && draft.orgRole !== baseline.orgRole) {
      setPendingAccessChange(draft);
      return;
    }
    return onSubmit(draft);
  }

  return (
    <>
      <BottomSheetModal
        header={
          <SheetHeader
            subtitle={
              `${managementUser.firstName} ${managementUser.lastName}`.trim() ||
              managementUser.email
            }
            title="Edit management access"
          />
        }
        scrollable
        visible={visible}
        onDismiss={guard.requestClose}
      >
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
            {draft.managementDepartmentIds.length === 0 ? (
              <AppText tone="danger" variant="meta">
                {`Select at least one ${MANAGEMENT_DEPARTMENT_LABELS.singularLower}, or close this and use Remove from Management instead`}
              </AppText>
            ) : null}
          </View>
        </View>

        {error ? <InlineError message={error} /> : null}

        <SheetActions>
          <Button
            disabled={!canSubmit}
            label="Save Access"
            loading={isPending}
            onPress={submitDraft}
            tone="primary"
          />
          <Button disabled={isPending} label="Cancel" onPress={guard.requestClose} tone="neutral" />
        </SheetActions>
      </BottomSheetModal>

      <ConfirmationModal {...guard.confirmationProps} />
      <ConfirmationModal
        body={`Change access from ${ROLE_LABELS[baseline.orgRole]} to ${ROLE_LABELS[pendingAccessChange?.orgRole ?? baseline.orgRole]}? The current invitation will be revoked and a replacement will be sent to ${managementUser.email}.`}
        confirmLabel="Revoke and resend"
        confirmTone="danger"
        loading={isPending}
        onCancel={() => setPendingAccessChange(null)}
        onConfirm={() => {
          const next = pendingAccessChange;
          setPendingAccessChange(null);
          return next ? onSubmit(next) : undefined;
        }}
        title="Replace invitation access?"
        visible={pendingAccessChange !== null}
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

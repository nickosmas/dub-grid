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
import { Chip } from "../../../shared/components/Chip";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../shared/components/SegmentedControl";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import type { ManagementAccessRole } from "./ManagementAccessSheet";

type Draft = {
  orgRole: ManagementAccessRole;
  managementDepartmentIds: number[];
};

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

/**
 * Edit an existing roster member's role and departments. The staff-side sheet
 * (ManagementAccessSheet) works from a MobilePerson and can also grant access
 * for the first time; this one only ever edits someone already on the roster,
 * who may have no staff profile at all.
 */
export function ManagementUserAccessSheet({
  visible,
  managementUser,
  departmentLabel,
  managementDepartments,
  isPending,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  managementUser: MobileManagementUser;
  departmentLabel: string;
  managementDepartments: MobileDepartment[];
  isPending: boolean;
  onDismiss: () => void;
  onSubmit: (draft: Draft) => void;
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
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);

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
  const canSubmit = !isPending && draft.managementDepartmentIds.length > 0;

  function close() {
    setDraft(baseline);
    setShowDiscardConfirmation(false);
    onDismiss();
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
        onDismiss={() => {
          if (isPending) return;
          if (hasUnsavedChanges) {
            setShowDiscardConfirmation(true);
            return;
          }
          close();
        }}
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
            {draft.managementDepartmentIds.length === 0 ? (
              <AppText tone="danger" variant="meta">
                {`Select at least one management ${departmentLabel.toLowerCase()}, or remove their access instead`}
              </AppText>
            ) : null}
          </View>
        </View>

        <SheetActions>
          <Button
            disabled={!canSubmit}
            label="Save Access"
            loading={isPending}
            onPress={() => onSubmit(draft)}
            tone="primary"
          />
          <Button disabled={isPending} label="Cancel" onPress={close} tone="neutral" />
        </SheetActions>
      </BottomSheetModal>

      <ConfirmationModal
        body="Your changes to their management access will be lost."
        confirmLabel="Discard"
        confirmTone="danger"
        onCancel={() => setShowDiscardConfirmation(false)}
        onConfirm={close}
        title="Discard unsaved changes?"
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

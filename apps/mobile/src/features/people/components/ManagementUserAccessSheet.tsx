import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileDepartment, MobileManagementUser } from "@dubgrid/contracts";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { getMobileEditorDismissLabel } from "@dubgrid/design-tokens";
import { InlineError } from "../../../shared/components/InlineError";
import { Chip } from "../../../shared/components/Chip";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { SectionNotice } from "./SectionNotice";
import { useUnsavedChangesGuard } from "../../../shared/hooks/useUnsavedChangesGuard";
import { MANAGEMENT_DEPARTMENT_LABELS } from "../../../shared/lib/departments";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../../../shared/theme/tokens";
import type { ManagementAccessRole } from "../lib/managementAccess";

type Draft = {
  /** Rides along unchanged: the write that takes this draft needs the pair. */
  orgRole: ManagementAccessRole;
  managementDepartmentIds: number[];
};

function sameIds(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * Edit an existing roster member's departments. The staff-side sheet
 * (ManagementAccessSheet) works from a MobilePerson and can also grant access
 * for the first time; this one only ever edits someone already on the roster,
 * who may have no staff profile at all. Their role is not here: the actions
 * sheet has its own access-level action for that, so this is the same
 * departments editor a person with a profile gets.
 */
export function ManagementUserAccessSheet({
  visible,
  managementUser,
  managementDepartments,
  isPending,
  error,
  onDismiss,
  onRemove,
  onSubmit,
  overlay,
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
  /**
   * Saving with no departments left. Handed up rather than confirmed here: the
   * parent already owns the removal prompt and mutation for its own Remove
   * button, and two copies of that prompt would be two copies of its wording.
   */
  onRemove: () => void;
  onSubmit: (draft: Draft) => Promise<unknown>;
  /**
   * The parent's prompts, rendered inside this sheet while it is the one on
   * top: iOS refuses a second Modal while a sheet is up, so a confirmation
   * raised from here (`onRemove`) has to ride in the sheet's overlay slot.
   */
  overlay?: ReactNode;
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

  const hasUnsavedChanges = !sameIds(
    draft.managementDepartmentIds,
    baseline.managementDepartmentIds,
  );
  // No length floor: this sheet only ever edits someone already on the roster,
  // so clearing every department is a legitimate save that means removal.
  // Dirtiness is part of it, not just validity: a Save that is live on an
  // untouched sheet invites a no-op write, and the same `hasUnsavedChanges`
  // already decides whether closing asks — so the button and the discard
  // prompt can never disagree about whether there is anything to save.
  const canSubmit = !isPending && hasUnsavedChanges;

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

  const removalNotices =
    draft.managementDepartmentIds.length === 0
      ? [
          managementUser.source === "pending_invite"
            ? "Saving now revokes their pending management invitation."
            : "Saving now takes them off the management roster.",
        ]
      : [];

  function submitDraft() {
    // Ahead of the role branch below: an empty save takes them off the roster
    // outright, so whatever role it was being re-pointed at is moot.
    if (draft.managementDepartmentIds.length === 0) {
      onRemove();
      return;
    }
    return onSubmit(draft);
  }

  return (
    <BottomSheetModal
      overlay={
        <>
          <ConfirmationModal presentation="inline" {...guard.confirmationProps} />
          {overlay}
        </>
      }
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions
            primaryAction={
              <Button
                disabled={!canSubmit}
                label="Save Access"
                loading={isPending}
                onPress={submitDraft}
                tone="primary"
              />
            }
          >
            <Button
              disabled={isPending}
              // Same tri-state web uses. Discard resets the draft and leaves
              // the sheet open; dismissing with edits in hand is the drag or
              // the backdrop, which this guard already confirms.
              label={getMobileEditorDismissLabel({ hasUnsavedChanges })}
              onPress={hasUnsavedChanges ? guard.discard : guard.requestClose}
              tone="neutral"
            />
          </SheetActions>
        </>
      }
      header={
        <SheetHeader
          subtitle={
            `${managementUser.firstName} ${managementUser.lastName}`.trim() || managementUser.email
          }
          title="Edit management access"
        />
      }
      scrollable
      visible={visible}
      onDismiss={guard.requestClose}
    >
      <View style={styles.body}>
        {/* A consequence of the save, so it is raised once for the sheet
              rather than sitting under the chips that produced it. */}
        <SectionNotice messages={removalNotices} />
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
                    managementDepartmentIds: current.managementDepartmentIds.includes(department.id)
                      ? current.managementDepartmentIds.filter((id) => id !== department.id)
                      : [...current.managementDepartmentIds, department.id],
                  }))
                }
                selected={draft.managementDepartmentIds.includes(department.id)}
              />
            ))}
          </View>
        </View>
      </View>
    </BottomSheetModal>
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

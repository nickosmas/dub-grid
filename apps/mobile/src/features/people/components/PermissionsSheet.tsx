import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_CATEGORY_ORDER,
  PERMISSION_MODULES,
  buildInitialPermissions,
  countPermissionLevels,
  describePermissionModule,
  editCellState,
  togglePermissionModule,
  viewCellState,
  type PermissionCellState,
  type PermissionEditorLabels,
  type PermissionModule,
} from "@dubgrid/authz";
import type { AdminPermissions } from "@dubgrid/domain";
import { AppSwitch } from "../../../shared/components/AppSwitch";
import { AppText } from "../../../shared/components/AppText";
import {
  BottomSheetModal,
  SheetActions,
  SheetHeader,
} from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { InlineError } from "../../../shared/components/InlineError";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace } from "../../../shared/theme/tokens";

const CELL_WIDTH = 76;

/**
 * An Admin's permissions, the way web's editor sets them: one row per area
 * with a View and an Edit switch, "Always on" or "Included" where the level
 * isn't the row's own to turn off. The rules come from `@dubgrid/authz`, so a
 * change to them reaches web and the app together.
 */
export function PermissionsSheet({
  visible,
  personName,
  stored,
  labels,
  isPending,
  error,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  personName: string;
  stored: Partial<AdminPermissions> | null;
  labels: PermissionEditorLabels;
  isPending: boolean;
  error?: string | null;
  onDismiss: () => void;
  onSave: (permissions: AdminPermissions) => Promise<unknown> | void;
}) {
  const initial = useMemo(() => buildInitialPermissions(stored), [stored]);
  const [perms, setPerms] = useState<AdminPermissions>(initial);
  const [wasVisible, setWasVisible] = useState(visible);

  // Each opening starts from what's stored.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPerms(initial);
  }

  const count = countPermissionLevels(perms);
  const changed = JSON.stringify(perms) !== JSON.stringify(initial);

  return (
    <BottomSheetModal
      footer={
        <>
          {error ? <InlineError message={error} /> : null}
          <SheetActions
            primaryAction={
              <Button
                disabled={isPending || !changed}
                label="Save"
                loading={isPending}
                onPress={() => onSave(perms)}
              />
            }
          >
            <Button disabled={isPending} label="Cancel" onPress={onDismiss} tone="neutral" />
          </SheetActions>
        </>
      }
      header={
        <SheetHeader
          subtitle={`${personName} · ${count.enabled} of ${count.total}`}
          title="Permissions"
        />
      }
      scrollable
      visible={visible}
      onDismiss={onDismiss}
    >
      {PERMISSION_CATEGORY_ORDER.map((category) => (
        <PermissionGroup
          disabled={isPending}
          key={category}
          labels={labels}
          modules={PERMISSION_MODULES.filter((mod) => mod.category === category)}
          perms={perms}
          title={PERMISSION_CATEGORY_LABELS[category]}
          onToggle={(mod, direction) =>
            setPerms((current) => togglePermissionModule(current, mod, direction))
          }
        />
      ))}
    </BottomSheetModal>
  );
}

function PermissionGroup({
  title,
  modules,
  perms,
  labels,
  disabled,
  onToggle,
}: {
  title: string;
  modules: PermissionModule[];
  perms: AdminPermissions;
  labels: PermissionEditorLabels;
  disabled: boolean;
  onToggle: (mod: PermissionModule, direction: "view" | "edit") => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        heading: {
          flexDirection: "row",
          alignItems: "flex-end",
          paddingLeft: mobileSpace.md,
          paddingRight: mobileSpace.md,
          marginTop: mobileSpace.lg,
          marginBottom: mobileSpace.sm,
        },
        card: { backgroundColor: mobileColors.surface, borderRadius: 14, overflow: "hidden" },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: mobileSpace.md,
          paddingRight: mobileSpace.md,
          paddingVertical: mobileSpace.sm,
          minHeight: 60,
        },
        divider: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: mobileColors.border,
        },
        copy: { flex: 1, minWidth: 0, paddingRight: mobileSpace.sm, gap: mobileSpace.xs },
        cell: { width: CELL_WIDTH, alignItems: "center", justifyContent: "center" },
      }),
    [mobileColors],
  );

  return (
    <View>
      <View style={styles.heading}>
        <AppText style={{ flex: 1 }} variant="sectionTitle">
          {title}
        </AppText>
        <AppText style={[styles.cell, { textAlign: "center" }]} tone="secondary" variant="meta">
          View
        </AppText>
        <AppText style={[styles.cell, { textAlign: "center" }]} tone="secondary" variant="meta">
          Edit
        </AppText>
      </View>
      <View style={styles.card}>
        {modules.map((mod, index) => (
          <View key={mod.id} style={[styles.row, index > 0 ? styles.divider : null]}>
            <View style={styles.copy}>
              <AppText variant="body">{mod.title}</AppText>
              <AppText tone="secondary" variant="meta">
                {describePermissionModule(mod, labels)}
              </AppText>
            </View>
            <PermissionCell
              disabled={disabled}
              label={`${mod.title} view`}
              state={viewCellState(mod, perms)}
              style={styles.cell}
              onToggle={() => onToggle(mod, "view")}
            />
            <PermissionCell
              disabled={disabled}
              label={`${mod.title} edit`}
              state={editCellState(mod, perms)}
              style={styles.cell}
              onToggle={() => onToggle(mod, "edit")}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function PermissionCell({
  state,
  label,
  disabled,
  style,
  onToggle,
}: {
  state: PermissionCellState;
  label: string;
  disabled: boolean;
  style: object;
  onToggle: () => void;
}) {
  return (
    <View style={style}>
      {state.kind === "switch" ? (
        <AppSwitch
          accessibilityLabel={label}
          disabled={disabled}
          value={state.on}
          onValueChange={onToggle}
        />
      ) : state.kind === "text" ? (
        <AppText numberOfLines={1} style={{ textAlign: "center" }} tone="secondary" variant="meta">
          {state.label}
        </AppText>
      ) : null}
    </View>
  );
}

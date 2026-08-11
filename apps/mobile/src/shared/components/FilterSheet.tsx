import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetModal } from "./BottomSheetModal";
import { Button } from "./Button";
import { PressableRow } from "./PressableRow";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileText, type MobileColors } from "../theme/tokens";

// Shared filter-sheet idiom, extracted from PeopleScreen.tsx so every
// screen with a filter/sort bottom sheet (people directory, and the mobile
// dashboard's full-page expanded views) looks and behaves the same way.

export function FilterSheet({
  visible,
  title,
  onDismiss,
  onDone,
  onClearAll,
  clearDisabled = false,
  children,
}: {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  onDone: () => void;
  onClearAll?: () => void;
  clearDisabled?: boolean;
  children: ReactNode;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <BottomSheetModal
      footer={
        <>
          {onClearAll ? (
            <Button
              compact
              disabled={clearDisabled}
              label="Clear all"
              tone="neutral"
              onPress={onClearAll}
            />
          ) : null}
          <View style={styles.footerSpacer} />
          <Button compact label="Done" tone="primary" onPress={onDone} />
        </>
      }
      // The title lives in the sheet's drag region rather than the scrolling
      // body, so dragging anywhere on the header closes the sheet.
      header={<Text style={styles.sheetTitle}>{title}</Text>}
      onDismiss={onDismiss}
      scrollable
      visible={visible}
    >
      {children}
    </BottomSheetModal>
  );
}

export function SelectionSection({ label, children }: { label: string; children: ReactNode }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={styles.selectionList}>{children}</View>
    </View>
  );
}

export function SelectionRow({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <PressableRow onPress={onPress} selected={selected} style={styles.selectionRow}>
      <View style={styles.selectionRowCopy}>
        <Text style={styles.selectionRowTitle}>{label}</Text>
        {detail ? <Text style={styles.selectionRowDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Ionicons color={mobileColors.brand} name="checkmark" size={20} /> : null}
    </PressableRow>
  );
}

export function FilterButton({
  activeCount,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  activeCount: number;
  expanded: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      expanded={expanded}
      fullWidth
      icon="options-outline"
      label="Filter"
      onPress={onPress}
      size="sm"
      // Promotes to a solid brand fill once any filter is on, so an active
      // filter set is visible without opening the sheet.
      tone={activeCount > 0 ? "primary" : "neutral"}
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    section: {
      gap: 10,
    },
    sectionTitle: {
      ...mobileText.label,
      color: mobileColors.textSubtle,
      textTransform: "uppercase",
    },
    sheetTitle: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
    },
    footerSpacer: {
      flex: 1,
    },
    selectionList: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      overflow: "hidden",
    },
    selectionRow: {
      minHeight: 58,
      alignItems: "center",
      borderBottomColor: mobileColors.borderSubtle,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    selectionRowCopy: {
      flex: 1,
      gap: 2,
    },
    selectionRowTitle: {
      ...mobileText.body,
      color: mobileColors.textPrimary,
    },
    selectionRowDetail: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });

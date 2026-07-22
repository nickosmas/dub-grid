import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetModal } from "./BottomSheetModal";
import { Button } from "./Button";
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
      onDismiss={onDismiss}
      scrollable
      visible={visible}
    >
      <Text style={styles.sheetTitle}>{title}</Text>
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={({ pressed }) => [styles.selectionRow, pressed && styles.selectionRowPressed]}
    >
      <View style={styles.selectionRowCopy}>
        <Text style={styles.selectionRowTitle}>{label}</Text>
        {detail ? <Text style={styles.selectionRowDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Ionicons color={mobileColors.brand} name="checkmark" size={20} /> : null}
    </Pressable>
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
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)" }}
      onPress={onPress}
      style={[styles.filterButton, activeCount > 0 && styles.filterButtonActive]}
    >
      <Ionicons
        color={activeCount > 0 ? mobileColors.textInverse : mobileColors.textSecondary}
        name="options-outline"
        size={16}
      />
      <Text
        numberOfLines={1}
        style={[styles.filterButtonText, activeCount > 0 && styles.filterButtonTextActive]}
      >
        Filter
      </Text>
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) => StyleSheet.create({
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
  filterButton: {
    minHeight: 46,
    alignItems: "center",
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
    borderRadius: mobileRadii.control,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  filterButtonActive: {
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  filterButtonText: {
    color: mobileColors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  filterButtonTextActive: {
    color: mobileColors.textInverse,
  },
  selectionList: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
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
  selectionRowPressed: {
    opacity: 0.64,
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

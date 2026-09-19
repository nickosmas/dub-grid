import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../../shared/theme/tokens";
import { IllustrationFrame, MockButton, Text } from "./illustration-primitives";

/**
 * The Requests tab: the tab strip
 * (`shared/components/ScrollableTabStrip.tsx`) above a swap request awaiting
 * the viewer's answer (`RequestCard` in
 * `shift-requests/screens/RequestsScreen.tsx`).
 */
const TABS = [
  { key: "available", label: "Available", count: 3, active: true },
  { key: "mine", label: "Mine", count: 1, active: false },
  { key: "history", label: "History", count: undefined, active: false },
] as const;

export function IllustrationSwapPreview() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <IllustrationFrame gap={20}>
      <View style={styles.tabStrip}>
        {TABS.map((tab) => (
          <View key={tab.key} style={[styles.tab, tab.active && styles.tabActive]}>
            <Text
              style={[styles.tabLabel, tab.active ? styles.tabLabelActive : styles.tabLabelIdle]}
            >
              {tab.label}
            </Text>
            {tab.count === undefined ? null : (
              <View style={[styles.tabBadge, tab.active && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab.active && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardIconFrame}>
              <Ionicons color={mobileColors.brand} name="swap-horizontal-outline" size={18} />
            </View>
            <View style={styles.titleColumn}>
              <Text style={styles.requestTitle}>Laura Marshall</Text>
              <Text style={styles.metaText}>Swap request</Text>
              <View style={styles.shiftPillRow}>
                <View style={styles.shiftPill}>
                  <Text style={styles.shiftPillText}>Day Shift</Text>
                </View>
                <Text style={styles.shiftTimeText}>7:00 AM - 3:30 PM</Text>
              </View>
            </View>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>Open</Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <MockButton label="Accept" />
          <MockButton label="Decline" tone="neutral" />
        </View>
      </View>
    </IllustrationFrame>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    tabStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.controlNeutralBg,
    },
    tabActive: {
      backgroundColor: mobileColors.brand,
    },
    tabLabel: {
      ...mobileText.bodyStrong,
      flexShrink: 1,
    },
    tabLabelIdle: {
      color: mobileColors.textSecondary,
    },
    tabLabelActive: {
      color: mobileColors.onBrandText,
    },
    tabBadge: {
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.surface,
    },
    tabBadgeActive: {
      backgroundColor: "rgba(255, 255, 255, 0.22)",
    },
    tabBadgeText: {
      ...mobileText.badge,
      color: mobileColors.textMuted,
      textAlign: "center",
      includeFontPadding: false,
    },
    tabBadgeTextActive: {
      color: mobileColors.textInverse,
    },
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      padding: 16,
      gap: 10,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
    },
    cardTitleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    cardIconFrame: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
    titleColumn: {
      flex: 1,
      minWidth: 0,
      gap: 10,
    },
    requestTitle: {
      ...mobileText.cardTitle,
      color: mobileColors.textPrimary,
    },
    metaText: {
      ...mobileText.body,
      color: mobileColors.textMuted,
    },
    shiftPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    // A shift with no stored colour runs on brand tokens, which is the most
    // common case on a fresh organization.
    shiftPill: {
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    shiftPillText: {
      ...mobileTextWeighted("meta", "semibold"),
      color: mobileColors.brand,
      includeFontPadding: false,
    },
    shiftTimeText: {
      ...mobileTextWeighted("rowTitle", "medium"),
      color: mobileColors.textMuted,
      includeFontPadding: false,
    },
    statusChip: {
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.brandBorder,
      backgroundColor: mobileColors.brandSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      alignSelf: "flex-start",
    },
    statusChipText: {
      ...mobileTextWeighted("caption", "semibold"),
      color: mobileColors.brand,
      includeFontPadding: false,
    },
    cardActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginLeft: 42,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
  });

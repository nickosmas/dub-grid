import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileElevation,
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import type { CardIconTone } from "../../../shared/components/Screen";

function createToneStyles(
  mobileColors: MobileColors,
): Record<CardIconTone, { backgroundColor: string; borderColor: string; iconColor: string }> {
  return {
    brand: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      iconColor: mobileColors.brand,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      iconColor: mobileColors.warningText,
    },
    danger: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      iconColor: mobileColors.dangerText,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      iconColor: mobileColors.successText,
    },
  };
}

function MetricTile({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: CardIconTone;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];

  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Text style={styles.tileLabel}>{label}</Text>
        <View
          style={[
            styles.tileIconFrame,
            { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor },
          ]}
        >
          <Ionicons name={icon} size={16} color={toneStyle.iconColor} />
        </View>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileDetail}>{detail}</Text>
    </View>
  );
}

const STATUS_TONE: Record<string, CardIconTone> = {
  Attention: "danger",
  Approval: "warning",
  Setup: "warning",
  Healthy: "success",
};

export function DashboardHeroCard({
  summary,
  metrics,
}: {
  summary: MobileDashboardResponse["heroSummary"];
  metrics: MobileDashboardResponse["metrics"];
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const tone = STATUS_TONE[summary.statusLabel] ?? "brand";
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];

  return (
    <View style={styles.card}>
      <View style={styles.headerCopy}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor },
          ]}
        >
          <Text style={[styles.statusPillLabel, { color: toneStyle.iconColor }]}>
            {summary.statusLabel}
          </Text>
        </View>
        <Text style={styles.title}>{summary.title}</Text>
      </View>
      <View style={styles.tileRow}>
        <MetricTile
          label="Coverage"
          value={metrics.coveragePct != null ? `${metrics.coveragePct}%` : "—"}
          detail={metrics.coveragePct != null ? "Current staffing coverage" : "Not configured"}
          icon="shield-checkmark-outline"
          tone="brand"
        />
        <MetricTile
          label="Open gaps"
          value={String(metrics.openGapCount)}
          detail="Staffing gaps this period"
          icon="alert-circle-outline"
          tone={metrics.openGapCount > 0 ? "danger" : "success"}
        />
        <MetricTile
          label="Pending approvals"
          value={String(metrics.pendingApprovalsCount)}
          detail="Requests waiting for review"
          icon="checkmark-done-outline"
          tone={metrics.pendingApprovalsCount > 0 ? "warning" : "success"}
        />
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      // Borderless in light mode, hairline in dark: matches the shared Card.
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.cardBorder,
      padding: mobileSpace.xl,
      gap: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    headerCopy: {
      gap: 6,
    },
    statusPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusPillLabel: {
      ...mobileText.badge,
      ...mobilePillOverflow.displayText,
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    tileRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    // Kept boxed, unlike the empty-state panel. These three tiles are nothing
    // but text, so a soft hairline is the only thing grouping each label with
    // its number. Borderless, the columns ran together and the values stopped
    // reading as a row. `control` radius nests inside the card's.
    tile: {
      flexGrow: 1,
      flexBasis: "30%",
      minWidth: 0,
      padding: 12,
      gap: 6,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
    },
    tileHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 6,
    },
    tileLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
      flex: 1,
      flexShrink: 1,
      flexWrap: "wrap",
    },
    tileIconFrame: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      // Nudge into the tile's top-right corner, matching the shared Card
      // component's icon treatment. Kept smaller than the tile's own padding
      // (12) so it stays inside the tile's bounds.
      marginTop: -4,
      marginRight: -4,
    },
    tileValue: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
    },
    tileDetail: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
  });

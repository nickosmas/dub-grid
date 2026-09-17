import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Pressable } from "../../../shared/components/Pressable";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileElevation,
  mobileMotion,
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import type { CardIconTone } from "../../../shared/components/Screen";
import { coverageColor } from "../lib/coverage";

// Fill only, no stroke: the same rule as `CountBadge` and `Chip`.
function createToneStyles(
  mobileColors: MobileColors,
): Record<CardIconTone, { backgroundColor: string; color: string }> {
  return {
    brand: { backgroundColor: mobileColors.brandSoft, color: mobileColors.brand },
    warning: { backgroundColor: mobileColors.warningSoft, color: mobileColors.warningText },
    danger: { backgroundColor: mobileColors.dangerSoft, color: mobileColors.dangerText },
    success: { backgroundColor: mobileColors.successSoft, color: mobileColors.successText },
  };
}

const STATUS_TONE: Record<string, CardIconTone> = {
  Attention: "danger",
  Approval: "warning",
  Setup: "warning",
  Healthy: "success",
};

/**
 * A secondary figure under the coverage meter, tappable when it has somewhere
 * to go. A chip rather than a tile: the number is the content, and the tile's
 * own border, icon frame and caption were three more edges around one digit.
 */
function MetricChip({
  label,
  value,
  icon,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: CardIconTone;
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];

  return (
    <Pressable
      accessibilityLabel={`${value} ${label}`}
      accessibilityRole={onPress ? "button" : undefined}
      android_ripple={onPress ? { color: mobileColors.rippleNeutral } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: toneStyle.backgroundColor },
        pressed && onPress && styles.chipPressed,
      ]}
    >
      <Ionicons color={toneStyle.color} name={icon} size={16} />
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.chipValue, { color: toneStyle.color }]}
      >
        {value}
      </Text>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={[styles.chipLabel, { color: toneStyle.color }]}
      >
        {label}
      </Text>
      {onPress ? <Ionicons color={toneStyle.color} name="chevron-forward" size={14} /> : null}
    </Pressable>
  );
}

export function DashboardHeroCard({
  summary,
  metrics,
  onOpenGaps,
  onOpenApprovals,
}: {
  summary: MobileDashboardResponse["heroSummary"];
  metrics: MobileDashboardResponse["metrics"];
  onOpenGaps?: () => void;
  onOpenApprovals?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const tone = STATUS_TONE[summary.statusLabel] ?? "brand";
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];
  const coverage = metrics.coveragePct;
  const meterColor =
    coverage == null ? mobileColors.textMuted : coverageColor(mobileColors, coverage);

  return (
    <View style={styles.card}>
      <View style={styles.headerCopy}>
        <View style={[styles.statusPill, { backgroundColor: toneStyle.backgroundColor }]}>
          <Text style={[styles.statusPillLabel, { color: toneStyle.color }]}>
            {summary.statusLabel}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>
          {summary.title}
        </Text>
      </View>

      {/* Coverage is the one figure that summarises the period, so it is the
          only large number on the surface; everything else reads against it. */}
      <View style={styles.coverage}>
        <View style={styles.coverageFigureRow}>
          <Text
            accessibilityLabel={
              coverage == null ? "Coverage not configured" : `Coverage ${coverage} percent`
            }
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={styles.coverageFigure}
          >
            {coverage == null ? "—" : `${coverage}%`}
          </Text>
          <View style={styles.coverageCopy}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.coverageLabel}>
              Coverage
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.coverageDetail}>
              {coverage == null ? "Not configured" : "Current staffing coverage"}
            </Text>
          </View>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={coverage == null ? undefined : { min: 0, max: 100, now: coverage }}
          style={styles.track}
        >
          <View
            style={[
              styles.fill,
              {
                backgroundColor: meterColor,
                width: `${Math.min(100, Math.max(0, coverage ?? 0))}%`,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.chipRow}>
        <MetricChip
          icon="alert-circle-outline"
          label={metrics.openGapCount === 1 ? "open gap" : "open gaps"}
          onPress={metrics.openGapCount > 0 ? onOpenGaps : undefined}
          tone={metrics.openGapCount > 0 ? "danger" : "success"}
          value={metrics.openGapCount}
        />
        <MetricChip
          icon="checkmark-done-outline"
          label={metrics.pendingApprovalsCount === 1 ? "pending approval" : "pending approvals"}
          onPress={metrics.pendingApprovalsCount > 0 ? onOpenApprovals : undefined}
          tone={metrics.pendingApprovalsCount > 0 ? "warning" : "success"}
          value={metrics.pendingApprovalsCount}
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
      padding: mobileSpace.lg,
      gap: mobileSpace.lg,
      ...mobileElevation("card", isDark),
    },
    headerCopy: {
      gap: mobileSpace.sm,
    },
    statusPill: {
      ...mobilePillOverflow.displayContainer,
      alignSelf: "flex-start",
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.xs,
    },
    statusPillLabel: {
      ...mobileText.badge,
      ...mobilePillOverflow.displayText,
    },
    title: {
      ...mobileText.title,
      color: mobileColors.textPrimary,
    },
    coverage: {
      gap: mobileSpace.sm,
    },
    coverageFigureRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: mobileSpace.md,
    },
    coverageFigure: {
      ...mobileText.display,
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    coverageCopy: {
      flex: 1,
      // Sits on the figure's baseline rather than centred against its cap.
      paddingBottom: mobileSpace.xs,
    },
    coverageLabel: {
      ...mobileText.label,
      color: mobileColors.textSecondary,
    },
    coverageDetail: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    track: {
      height: 8,
      borderRadius: mobileRadii.pill,
      backgroundColor: mobileColors.borderSubtle,
      overflow: "hidden",
    },
    fill: {
      height: "100%",
      borderRadius: mobileRadii.pill,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileSpace.sm,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
      borderRadius: mobileRadii.pill,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      // Hugs its content; two chips share the row and wrap under large text.
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    chipPressed: {
      transform: [{ scale: mobileMotion.press.scale }],
    },
    chipValue: {
      ...mobileText.bodyStrong,
      ...mobileTabularText,
    },
    chipLabel: {
      ...mobileText.meta,
      flexShrink: 1,
    },
  });

import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Pressable } from "../../../shared/components/Pressable";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileElevation,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import type { CardIconTone } from "../../../shared/components/Screen";
import { coverageColor } from "../lib/coverage";

// Text colour only: the hero carries no pills. A status word and a figure
// read in their tone's colour, and the surface stays one white card.
function createToneColors(mobileColors: MobileColors): Record<CardIconTone, string> {
  return {
    brand: mobileColors.brand,
    warning: mobileColors.warningText,
    danger: mobileColors.dangerText,
    success: mobileColors.successText,
  };
}

const STATUS_TONE: Record<string, CardIconTone> = {
  Attention: "danger",
  Approval: "warning",
  Setup: "warning",
  Healthy: "success",
};

/**
 * A secondary figure under the coverage meter: the number in its tone's
 * colour, the label beneath, a chevron when it opens something. No fill and
 * no icon; the figure is the content.
 */
function MetricStat({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  tone: CardIconTone;
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const color = useMemo(() => createToneColors(mobileColors), [mobileColors])[tone];

  return (
    <Pressable
      accessibilityLabel={`${value} ${label}`}
      accessibilityRole={onPress ? "button" : undefined}
      android_ripple={onPress ? { color: mobileColors.rippleNeutral } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.stat, pressed && onPress && styles.statPressed]}
    >
      <View style={styles.statFigureRow}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.statValue, { color }]}>
          {value}
        </Text>
        {onPress ? (
          <Ionicons color={mobileColors.textMuted} name="chevron-forward" size={14} />
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
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
  const statusColor = useMemo(() => createToneColors(mobileColors), [mobileColors])[tone];
  const coverage = metrics.coveragePct;
  const meterColor =
    coverage == null ? mobileColors.textMuted : coverageColor(mobileColors, coverage);

  return (
    <View style={styles.card}>
      <View style={styles.headerCopy}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.status, { color: statusColor }]}
        >
          {summary.statusLabel}
        </Text>
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

      <View style={styles.statRow}>
        <MetricStat
          label={metrics.openGapCount === 1 ? "open gap" : "open gaps"}
          onPress={metrics.openGapCount > 0 ? onOpenGaps : undefined}
          tone={metrics.openGapCount > 0 ? "danger" : "success"}
          value={metrics.openGapCount}
        />
        <View style={styles.statDivider} />
        <MetricStat
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
      gap: mobileSpace.xs,
    },
    status: {
      ...mobileText.label,
      textTransform: "uppercase",
      letterSpacing: 0.6,
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
    statRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.lg,
    },
    stat: {
      flex: 1,
      gap: mobileSpace.xs,
      borderRadius: mobileRadii.control,
    },
    statPressed: {
      opacity: 0.6,
    },
    statFigureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.xs,
    },
    statValue: {
      ...mobileText.title,
      ...mobileTabularText,
    },
    statLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
  });

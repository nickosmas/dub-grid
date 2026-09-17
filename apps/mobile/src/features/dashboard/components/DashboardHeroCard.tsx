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
          only large number on the surface. When requirements are not
          configured the headline already says so, and a dash over an empty
          meter only repeated it. */}
      {coverage != null ? (
        <View style={styles.coverage}>
          <View style={styles.coverageFigureRow}>
            <Text
              accessibilityLabel={`Coverage ${coverage} percent`}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={styles.coverageFigure}
            >
              {coverage}%
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.coverageLabel}>
              coverage
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: coverage }}
            style={styles.track}
          >
            <View
              style={[
                styles.fill,
                { backgroundColor: meterColor, width: `${Math.min(100, Math.max(0, coverage))}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* A hairline above the stats: without it the pair read as a third
          line of the headline rather than as the card's figures. */}
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
      alignItems: "baseline",
      gap: mobileSpace.sm,
    },
    coverageFigure: {
      ...mobileText.display,
      ...mobileTabularText,
      color: mobileColors.textPrimary,
    },
    coverageLabel: {
      ...mobileText.meta,
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
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: mobileSpace.lg,
    },
    // Centred in their half of the card: two left-aligned stats read as a
    // list that stopped after one row.
    stat: {
      flex: 1,
      alignItems: "center",
      gap: mobileSpace.xs,
      borderRadius: mobileRadii.control,
    },
    statPressed: {
      opacity: 0.6,
    },
    statFigureRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.xs,
    },
    statValue: {
      ...mobileText.title,
      ...mobileTabularText,
    },
    statLabel: {
      ...mobileText.caption,
      color: mobileColors.textMuted,
      textAlign: "center",
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: mobileColors.borderSubtle,
    },
  });

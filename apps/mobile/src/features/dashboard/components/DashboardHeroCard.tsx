import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { Pressable } from "../../../shared/components/Pressable";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { coverageColor, coverageToneForPct } from "../lib/coverage";
import { createToneTextColors } from "../lib/tone-text";
import { DashboardCard, type DashboardCardTone } from "./DashboardCard";

/**
 * The page's reading of the period, above the cards: a headline and one
 * sentence, the way Apple Health opens Insights with "Stand Ring Looks Good"
 * and a line under it. Nothing else lives up here; the status colour reaches
 * the page through the cards below.
 */
export function DashboardHeadline({
  summary,
}: {
  summary: MobileDashboardResponse["heroSummary"];
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View style={styles.headline}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.headlineTitle}>
        {summary.title}
      </Text>
      {summary.description ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.headlineBody}>
          {summary.description}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A secondary figure under the coverage meter: the number in its tone's
 * colour, the label beneath, a chevron when it opens something.
 */
function MetricStat({
  label,
  value,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  tone: Exclude<DashboardCardTone, "neutral">;
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const color = useMemo(() => createToneTextColors(mobileColors), [mobileColors])[tone];

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

/**
 * The coverage card: the period's one big figure over its meter, then the
 * two counts that need a hand. Its tone follows the coverage percentage, so
 * the card itself reads green, amber or red before a number is read.
 */
export function DashboardHeroCard({
  metrics,
  onOpenCoverage,
  onOpenGaps,
  onOpenApprovals,
}: {
  metrics: MobileDashboardResponse["metrics"];
  onOpenCoverage?: () => void;
  onOpenGaps?: () => void;
  onOpenApprovals?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const coverage = metrics.coveragePct;
  const tone = coverageToneForPct(coverage);
  const meterColor =
    coverage == null ? mobileColors.textMuted : coverageColor(mobileColors, coverage);

  return (
    <DashboardCard title="Coverage" tone={tone} onOpen={onOpenCoverage}>
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
              covered
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
      <View style={[styles.statRow, coverage != null ? styles.statRowDivided : null]}>
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
    </DashboardCard>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    headline: {
      gap: mobileSpace.xs,
    },
    headlineTitle: {
      ...mobileText.screenTitle,
      color: mobileColors.textPrimary,
    },
    headlineBody: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
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
    },
    // A hairline above the stats when a figure sits above them, so they
    // read as the card's second section rather than a third line of it.
    statRowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: mobileSpace.lg,
    },
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

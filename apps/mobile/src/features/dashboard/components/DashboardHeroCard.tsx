import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { Text } from "../../../shared/components/Text";
import type { MobileDashboardResponse } from "@dubgrid/contracts";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
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
import { coverageColor } from "../lib/coverage";
import { createToneTextColors } from "../lib/tone-text";
import { CoverageSectionRow } from "./CoverageSectionRow";
import { DashboardCard } from "./DashboardCard";
import {
  DASHBOARD_CARD_PREVIEW_LIMIT,
  DashboardRowList,
  hasMoreDashboardRows,
} from "./DashboardRowList";

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
  /** Colours the figure only when it is non-zero; a zero is plain, not green. */
  tone: "warning" | "danger";
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const toneColors = useMemo(() => createToneTextColors(mobileColors), [mobileColors]);
  const color = value > 0 ? toneColors[tone] : mobileColors.textPrimary;

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
 * The coverage card: the period's one big figure over its meter, the same
 * figure broken down by focus area, and at the foot the two counts that
 * need a hand. One card for all of it; a second "Coverage by wings" card
 * said the same thing twice, and "See all" opens the full breakdown, but
 * only while there are more focus areas than the card previews.
 *
 * A null percentage means no coverage requirements exist yet. The card then
 * says so in place of the meter and the open-gap count: a zero there would
 * read as fully staffed rather than as nothing to measure.
 */
export function DashboardHeroCard({
  metrics,
  sections = [],
  onOpenCoverage,
  onOpenGaps,
  onOpenApprovals,
}: {
  metrics: MobileDashboardResponse["metrics"];
  /** Per-focus-area coverage; the card previews the first three. */
  sections?: MobileDashboardResponse["coverageBySection"];
  onOpenCoverage?: () => void;
  onOpenGaps?: () => void;
  onOpenApprovals?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const coverage = metrics.coveragePct;
  const configured = coverage != null;
  const meterColor = configured ? coverageColor(mobileColors, coverage) : mobileColors.textMuted;

  return (
    <DashboardCard
      title="Coverage"
      onOpen={hasMoreDashboardRows(sections.length) ? onOpenCoverage : undefined}
    >
      {!configured ? (
        <EmptyStateCard
          body="Set staffing requirements in Settings on the web to track coverage and open gaps here."
          compact
          iconName="options-outline"
          title="Coverage requirements not configured"
        />
      ) : (
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
      )}
      {sections.length > 0 ? (
        <View style={styles.breakdown}>
          <DashboardRowList
            items={sections}
            keyExtractor={(section) => String(section.focusAreaId)}
            limit={DASHBOARD_CARD_PREVIEW_LIMIT}
            renderItem={(section) => <CoverageSectionRow section={section} />}
          />
        </View>
      ) : null}
      <View style={styles.statRow}>
        {configured ? (
          <>
            <MetricStat
              label={metrics.openGapCount === 1 ? "open gap" : "open gaps"}
              onPress={metrics.openGapCount > 0 ? onOpenGaps : undefined}
              tone="danger"
              value={metrics.openGapCount}
            />
            <View style={styles.statDivider} />
          </>
        ) : null}
        <MetricStat
          label={metrics.pendingApprovalsCount === 1 ? "pending approval" : "pending approvals"}
          onPress={metrics.pendingApprovalsCount > 0 ? onOpenApprovals : undefined}
          tone="warning"
          value={metrics.pendingApprovalsCount}
        />
      </View>
    </DashboardCard>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
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
    // A hairline above the stats so they read as the card's closing section
    // rather than another line of it.
    statRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: mobileSpace.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
      paddingTop: mobileSpace.lg,
    },
    stat: {
      flex: 1,
      alignItems: "center",
      gap: mobileSpace.xs,
      borderRadius: mobileRadii.control,
      marginVertical: -mobileSpace.xs,
      paddingVertical: mobileSpace.xs,
    },
    statPressed: {
      backgroundColor: mobileColors.navActiveBg,
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
    // The rows carry their own vertical padding, so the section only pads
    // the first row off the hairline and gives back part of the last row's
    // padding, leaving the stats' hairline 16pt below the last row's text.
    breakdown: {
      paddingTop: mobileSpace.xs,
      marginBottom: -mobileSpace.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.borderSubtle,
    },
  });

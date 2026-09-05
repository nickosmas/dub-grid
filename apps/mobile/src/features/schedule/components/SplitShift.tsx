import { Fragment, useMemo, type ReactNode } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import type { MobileScheduleEntrySegment } from "@dubgrid/contracts";
import {
  getScheduleEntrySegmentTimeRange,
  getSplitShiftBadgeLabel,
  getSplitShiftSegmentLabel,
} from "../lib/schedule";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";

type SplitShiftVariant = "compact" | "hero" | "detail" | "supporting";
const SPLIT_SHIFT_DIVIDER_DASHES = Array.from({ length: 18 });

export function SplitShiftBadge({
  compact = false,
  count,
  inverse = false,
  label: customLabel,
}: {
  compact?: boolean;
  count: number;
  inverse?: boolean;
  label?: string | null;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const label = customLabel ?? getSplitShiftBadgeLabel(count);
  if (!label) {
    return null;
  }

  const contentColor = inverse ? mobileColors.textInverse : mobileColors.brand;

  return (
    <View
      accessibilityLabel={customLabel ? label : `Multiple Shifts, ${label}`}
      style={[styles.badge, compact && styles.badgeCompact, inverse && styles.badgeInverse]}
    >
      <Ionicons color={contentColor} name="layers-outline" size={compact ? 13 : 15} />
      <Text
        style={[
          styles.badgeText,
          compact && styles.badgeTextCompact,
          inverse && styles.badgeTextInverse,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function SplitShiftSegmentList({
  dashedDividers = false,
  getSegmentTimingLabel,
  inverse = false,
  leadingDivider = false,
  renderSegmentChip,
  segmentLabelIndices,
  segmentLabelStartIndex = 0,
  segmentLabelTotalCount,
  showSegmentLabels = true,
  segments,
  showWhenSingle = false,
  suppressCountAccessibilityLabel = false,
  variant,
}: {
  dashedDividers?: boolean;
  getSegmentTimingLabel?: (segment: MobileScheduleEntrySegment, index: number) => string | null;
  inverse?: boolean;
  leadingDivider?: boolean;
  renderSegmentChip?: (segment: MobileScheduleEntrySegment, index: number) => ReactNode;
  segmentLabelIndices?: ReadonlyArray<number>;
  segmentLabelStartIndex?: number;
  segmentLabelTotalCount?: number;
  showSegmentLabels?: boolean;
  segments: ReadonlyArray<MobileScheduleEntrySegment>;
  showWhenSingle?: boolean;
  suppressCountAccessibilityLabel?: boolean;
  variant: SplitShiftVariant;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  if (segments.length <= 1 && !showWhenSingle) {
    return null;
  }

  const isHero = variant === "hero";
  const isDetail = variant === "detail";
  const isSupporting = variant === "supporting";
  const segmentCount = segments.length;
  const labelTotalCount = segmentLabelTotalCount ?? segmentCount;

  return (
    <View
      accessibilityLabel={
        labelTotalCount > 1 && !suppressCountAccessibilityLabel
          ? `Multiple Shifts with ${labelTotalCount} shifts`
          : undefined
      }
      style={[
        styles.segmentList,
        isHero && styles.segmentListHero,
        isDetail && styles.segmentListDetail,
      ]}
    >
      {leadingDivider && dashedDividers ? <SplitShiftDashedDivider inverse={inverse} /> : null}
      {segments.map((segment, index) => {
        const title = segment.shiftName?.trim() || segment.label?.trim() || "Shift";
        const timeRange = getScheduleEntrySegmentTimeRange(segment);
        const timingLabel = getSegmentTimingLabel?.(segment, index) ?? null;
        const chip = isHero ? null : (renderSegmentChip?.(segment, index) ?? null);
        const heroCaption = getHeroSegmentCaption(segment);
        const hasDivider = index > 0;
        const segmentLabel = getSplitShiftSegmentLabel(
          segmentLabelIndices?.[index] ?? segmentLabelStartIndex + index,
          labelTotalCount,
        );

        return (
          <Fragment
            key={`${title}-${segment.startTime ?? "none"}-${segment.endTime ?? "none"}-${index}`}
          >
            {hasDivider && dashedDividers ? <SplitShiftDashedDivider inverse={inverse} /> : null}
            <View
              style={[
                styles.segmentBlock,
                isHero && styles.segmentBlockHero,
                isDetail && styles.segmentBlockDetail,
                isSupporting && styles.segmentBlockSupporting,
                hasDivider &&
                  !dashedDividers &&
                  (isHero ? styles.segmentDividerHero : styles.segmentDivider),
              ]}
            >
              {isHero ? (
                <View style={styles.segmentHeroBody}>
                  <View style={styles.segmentHeroMainRow}>
                    <View style={styles.segmentHeroCopy}>
                      <View style={styles.segmentHeroTitleRow}>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.segmentHeroPrimaryText,
                            styles.segmentHeroTitleText,
                            inverse && styles.segmentHeroPrimaryTextInverse,
                          ]}
                        >
                          {title}
                        </Text>
                        <SplitShiftBadge
                          count={labelTotalCount}
                          inverse={inverse}
                          label={segmentLabel}
                        />
                      </View>
                      {heroCaption ? (
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.segmentHeroCaptionText,
                            inverse && styles.segmentHeroCaptionTextInverse,
                          ]}
                        >
                          {heroCaption}
                        </Text>
                      ) : null}
                    </View>
                    {timeRange || timingLabel ? (
                      <View style={styles.segmentHeroMetaStack}>
                        {timeRange ? (
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.segmentHeroPrimaryText,
                              styles.segmentHeroMetaText,
                              inverse && styles.segmentHeroPrimaryTextInverse,
                            ]}
                          >
                            {timeRange}
                          </Text>
                        ) : null}
                        {timingLabel ? (
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.segmentHeroCaptionText,
                              styles.segmentHeroMetaText,
                              inverse && styles.segmentHeroCaptionTextInverse,
                            ]}
                          >
                            {timingLabel}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <>
                  {showSegmentLabels ? (
                    <Text style={styles.segmentEyebrow}>{segmentLabel}</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.segmentTitle,
                      inverse && styles.segmentTitleInverse,
                      isDetail && styles.segmentTitleDetail,
                      isSupporting && styles.segmentTitleSupporting,
                    ]}
                  >
                    {title}
                  </Text>
                  {timeRange ? (
                    <Text style={[styles.segmentMeta, inverse && styles.segmentMetaInverse]}>
                      {timeRange}
                    </Text>
                  ) : null}
                  {timingLabel ? (
                    <Text style={[styles.segmentTiming, inverse && styles.segmentTimingInverse]}>
                      {timingLabel}
                    </Text>
                  ) : null}
                  {segment.displayFocusAreaName ? (
                    <Text style={[styles.segmentMeta, inverse && styles.segmentMetaInverse]}>
                      {segment.displayFocusAreaName}
                    </Text>
                  ) : null}
                  {chip ? <View style={styles.segmentChipRow}>{chip}</View> : null}
                </>
              )}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

function getHeroSegmentCaption(segment: MobileScheduleEntrySegment): string | null {
  const role = segment.jobName?.trim();
  const fallback = segment.displayFocusAreaName?.trim();
  const baseCaption = role || fallback;

  if (segment.isMentored) {
    return baseCaption ? `${baseCaption} (Mentored)` : "Mentored";
  }

  return baseCaption || null;
}

function SplitShiftDashedDivider({ inverse }: { inverse: boolean }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  return (
    <View
      pointerEvents="none"
      style={styles.segmentDashedDivider}
      testID="split-shift-dashed-divider"
    >
      {SPLIT_SHIFT_DIVIDER_DASHES.map((_, index) => (
        <View
          key={index}
          style={[
            styles.segmentDashedDividerSegment,
            inverse && styles.segmentDashedDividerSegmentInverse,
          ]}
        />
      ))}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      alignItems: "center",
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    badgeCompact: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeInverse: {
      backgroundColor: "rgba(255, 255, 255, 0.16)",
      borderColor: "rgba(255, 255, 255, 0.28)",
    },
    badgeText: {
      ...mobileText.badge,
      color: mobileColors.brand,
      textTransform: "none",
    },
    badgeTextCompact: {
      fontSize: 11,
    },
    badgeTextInverse: {
      color: mobileColors.textInverse,
    },
    segmentList: {
      gap: 10,
    },
    segmentListHero: {
      gap: 12,
    },
    segmentListDetail: {
      gap: 12,
    },
    segmentBlock: {
      gap: 5,
    },
    segmentBlockHero: {
      gap: 6,
      width: "100%",
    },
    segmentBlockDetail: {
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.borderSubtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      padding: 12,
    },
    segmentBlockSupporting: {
      gap: 4,
    },
    segmentDivider: {
      borderTopColor: mobileColors.borderSubtle,
      borderTopWidth: 1,
      paddingTop: 10,
    },
    segmentDividerHero: {
      borderTopColor: "rgba(255, 255, 255, 0.18)",
      borderTopWidth: 1,
      paddingTop: 12,
    },
    segmentDashedDivider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    segmentDashedDividerSegment: {
      flex: 1,
      height: 1,
      borderRadius: 999,
      backgroundColor: mobileColors.borderSubtle,
    },
    segmentDashedDividerSegmentInverse: {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    segmentHeroBody: {
      width: "100%",
      gap: 6,
    },
    segmentHeroMainRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    segmentHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
    },
    segmentHeroTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    segmentHeroTitleText: {
      flexShrink: 1,
      minWidth: 0,
    },
    segmentHeroMetaStack: {
      flexShrink: 1,
      maxWidth: "44%",
      alignItems: "flex-end",
      gap: 4,
    },
    segmentHeroMetaText: {
      textAlign: "right",
    },
    segmentHeroPrimaryText: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    segmentHeroPrimaryTextInverse: {
      color: mobileColors.textInverse,
    },
    segmentHeroCaptionText: {
      ...mobileTextWeighted("body", "medium"),
      color: mobileColors.textMuted,
    },
    segmentHeroCaptionTextInverse: {
      color: "rgba(255, 255, 255, 0.82)",
    },
    segmentEyebrow: {
      ...mobileText.micro,
      color: mobileColors.brand,
    },
    segmentTitle: {
      ...mobileText.rowTitle,
      color: mobileColors.textPrimary,
    },
    segmentTitleDetail: {
      ...mobileTextWeighted("sectionTitle", "bold"),
    },
    segmentTitleHero: {
      ...mobileText.sectionTitle,
    },
    segmentTitleInverse: {
      color: mobileColors.textInverse,
    },
    segmentTitleSupporting: {
      ...mobileTextWeighted("meta", "bold"),
      color: mobileColors.textSecondary,
    },
    segmentMeta: {
      ...mobileTextWeighted("meta", "medium"),
      color: mobileColors.textMuted,
    },
    segmentMetaHero: {
      ...mobileText.body,
    },
    segmentMetaInverse: {
      color: "rgba(255, 255, 255, 0.82)",
    },
    segmentTiming: {
      ...mobileTextWeighted("meta", "bold"),
      color: mobileColors.brand,
    },
    segmentTimingHero: {
      ...mobileText.body,
    },
    segmentTimingInverse: {
      color: mobileColors.textInverse,
    },
    segmentChipRow: {
      alignItems: "flex-start",
    },
  });

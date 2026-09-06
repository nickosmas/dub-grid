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
  getSegmentStatusLabel,
  includeSegmentLabelInStatus = true,
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
  getSegmentStatusLabel?: (segment: MobileScheduleEntrySegment, index: number) => string | null;
  includeSegmentLabelInStatus?: boolean;
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
        const statusLabel = getSegmentStatusLabel?.(segment, index) ?? null;
        const chip = renderSegmentChip?.(segment, index) ?? null;
        const heroCaption = getHeroSegmentCaption(segment);
        const focusAreaName =
          segment.shiftId === null ? null : segment.displayFocusAreaName?.trim() || null;
        const metaIconColor = inverse ? "rgba(255, 255, 255, 0.82)" : mobileColors.textMuted;
        const hasDivider = index > 0;
        const segmentLabel = getSplitShiftSegmentLabel(
          segmentLabelIndices?.[index] ?? segmentLabelStartIndex + index,
          labelTotalCount,
        );
        const combinedSegmentLabel = statusLabel
          ? includeSegmentLabelInStatus
            ? `${segmentLabel} · ${statusLabel}`
            : statusLabel
          : segmentLabel;

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
                  <View style={styles.segmentHeroShiftGroup}>
                    <View style={styles.segmentHeroTitleRow}>
                      <Text
                        adjustsFontSizeToFit
                        numberOfLines={1}
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
                        label={combinedSegmentLabel}
                      />
                    </View>
                    {chip ? <View style={styles.segmentHeroChipRow}>{chip}</View> : null}
                    {!chip && heroCaption ? (
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
                  {focusAreaName || timeRange || timingLabel ? (
                    <View style={styles.segmentHeroContextGroup}>
                      {focusAreaName ? (
                        <View style={styles.segmentHeroFocusRow}>
                          <Ionicons color={metaIconColor} name="location-outline" size={16} />
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.segmentHeroCaptionText,
                              inverse && styles.segmentHeroCaptionTextInverse,
                            ]}
                          >
                            {focusAreaName}
                          </Text>
                        </View>
                      ) : null}
                      {timeRange || timingLabel ? (
                        <View style={styles.segmentHeroTimingRow}>
                          {timeRange ? (
                            <Ionicons color={metaIconColor} name="time-outline" size={16} />
                          ) : null}
                          {timeRange ? (
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.segmentHeroCaptionText,
                                inverse && styles.segmentHeroCaptionTextInverse,
                              ]}
                            >
                              {timeRange}
                            </Text>
                          ) : null}
                          {timingLabel ? (
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.segmentHeroCaptionText,
                                styles.segmentHeroTimingText,
                                styles.segmentHeroTimingLabel,
                                inverse && styles.segmentHeroCaptionTextInverse,
                              ]}
                            >
                              {timingLabel}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  {showSegmentLabels && !statusLabel ? (
                    <Text style={styles.segmentEyebrow}>{segmentLabel}</Text>
                  ) : null}
                  <View style={styles.segmentShiftGroup}>
                    <View style={styles.segmentTitleRow}>
                      <Text
                        adjustsFontSizeToFit
                        numberOfLines={1}
                        style={[
                          styles.segmentTitle,
                          styles.segmentTitleMain,
                          inverse && styles.segmentTitleInverse,
                          isDetail && styles.segmentTitleDetail,
                          isSupporting && styles.segmentTitleSupporting,
                        ]}
                      >
                        {title}
                      </Text>
                      {statusLabel ? (
                        <SplitShiftBadge
                          compact
                          count={labelTotalCount}
                          label={combinedSegmentLabel}
                        />
                      ) : null}
                    </View>
                    {chip ? <View style={styles.segmentChipRow}>{chip}</View> : null}
                  </View>
                  {focusAreaName || timeRange || timingLabel ? (
                    <View style={styles.segmentContextGroup}>
                      {focusAreaName ? (
                        <View style={styles.segmentFocusRow}>
                          <Ionicons color={metaIconColor} name="location-outline" size={16} />
                          <Text style={[styles.segmentMeta, inverse && styles.segmentMetaInverse]}>
                            {focusAreaName}
                          </Text>
                        </View>
                      ) : null}
                      {timeRange || timingLabel ? (
                        <View style={styles.segmentTimingRow}>
                          {timeRange ? (
                            <>
                              <Ionicons color={metaIconColor} name="time-outline" size={16} />
                              <Text
                                style={[styles.segmentMeta, inverse && styles.segmentMetaInverse]}
                              >
                                {timeRange}
                              </Text>
                            </>
                          ) : null}
                          {timingLabel ? (
                            <Text
                              style={[styles.segmentTiming, inverse && styles.segmentTimingInverse]}
                            >
                              {timingLabel}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
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
  const fallback = segment.shiftId !== null ? segment.displayFocusAreaName?.trim() : null;
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
      width: "100%",
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
      width: "100%",
      gap: 12,
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
      gap: 14,
    },
    segmentHeroShiftGroup: {
      gap: 4,
    },
    segmentHeroTitleRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    segmentHeroTitleText: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    segmentHeroChipRow: {
      alignItems: "flex-start",
    },
    segmentHeroFocusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    segmentHeroContextGroup: {
      gap: 8,
    },
    segmentHeroTimingRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    segmentHeroTimingText: {
      ...mobileTextWeighted("meta", "bold"),
    },
    segmentHeroTimingLabel: {
      marginLeft: "auto",
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
    segmentShiftGroup: {
      gap: 4,
    },
    segmentTitleRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    segmentTitleMain: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    segmentTimingRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    segmentFocusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    segmentContextGroup: {
      gap: 8,
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

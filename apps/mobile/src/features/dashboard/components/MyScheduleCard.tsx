import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { addDaysToIsoDate, getDaysBetweenIsoDates } from "@dubgrid/schedule-core";
import type { MobileScheduleEntry, ResolvedSchedulePresentationSegment } from "@dubgrid/contracts";
import { resolveShiftPillColors, type ShiftPillColors } from "@dubgrid/design-tokens";
import { Card } from "../../../shared/components/Screen";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileRadii,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { formatUsTime } from "../../../shared/lib/dates";
import { useMyScheduleQuery } from "../hooks/useMyScheduleQuery";
import { ExpandButton } from "./ExpandButton";

// Kept as narrow as possible while still fitting a full time range like
// "10:00 PM–6:00 AM" on one line at the pill's 11px font — a double shift
// renders two of these side by side, so width matters more here than in a
// single-pill day.
const PILL_WIDTH = 124;
const PILL_GAP = 6;
const DAY_CARD_GAP = 10;
// The pill sits mobileRadii.control (12px) inset inside the day card, which
// shares that same 12px radius — a nested corner needs a noticeably smaller
// radius than its container's to read as a smooth, concentric curve rather
// than a disconnected shape, so this stays well under the day card's.
const PILL_RADIUS = 6;
// Explicit min-height, shared by the worked-shift pill and the empty-day
// placeholder, sized for 3 stacked lines (name/job/time) so every pill is
// the same height regardless of whether a given shift has a job name or a
// time range to show — matches web's MyScheduleRow.tsx ShiftPill.
const SHIFT_PILL_MIN_HEIGHT = 71;

type DaySegmentPill = {
  key: string;
  label: string;
  jobName: string | null;
  timeRangeLabel: string | null;
  pill: ShiftPillColors | null;
};

function readOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDayHeader(dateIso: string): { weekday: string; dayNumber: string } {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase();
  const dayNumber = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  return { weekday, dayNumber };
}

function buildDateList(startDate: string, endDate: string): string[] {
  const dayCount = getDaysBetweenIsoDates(startDate, endDate) + 1;
  return Array.from({ length: Math.max(dayCount, 0) }, (_, index) =>
    addDaysToIsoDate(startDate, index),
  );
}

// One pill per segment — a "double shift" (two segments in one day) renders
// as two side-by-side pills, each with its own color/job/time, matching
// web's MyScheduleRow.tsx (which stacks them; mobile lays them out
// horizontally to fit its day-strip layout instead).
function buildDaySegmentPills(
  entry: MobileScheduleEntry | undefined,
  mobileColors: MobileColors,
  isDarkTheme: boolean,
): DaySegmentPill[] {
  if (!entry || entry.state.kind !== "worked") {
    return [];
  }

  const segments: Array<Partial<ResolvedSchedulePresentationSegment>> =
    entry.presentation.segments.length > 0 ? entry.presentation.segments : [{}];

  return segments.map((segment, index) => {
    const label =
      readOptionalText(segment.shiftName) ??
      readOptionalText(segment.label) ??
      readOptionalText(entry.presentation.shiftName) ??
      entry.presentation.label;

    const rawJobName = readOptionalText(segment.jobName);
    const jobName =
      rawJobName && normalizeLabel(rawJobName) !== normalizeLabel(label) ? rawJobName : null;

    const startTime = segment.startTime ?? (index === 0 ? entry.presentation.startTime : null);
    const endTime = segment.endTime ?? (index === 0 ? entry.presentation.endTime : null);
    const timeRangeLabel =
      startTime && endTime ? `${formatUsTime(startTime)}–${formatUsTime(endTime)}` : null;

    const rawPillColor =
      readOptionalText(segment.jobColor) ??
      (index === 0 ? readOptionalText(entry.presentation.shiftColor) : null);
    const pill = rawPillColor
      ? resolveShiftPillColors(
          {
            color: rawPillColor,
            text:
              readOptionalText(segment.jobTextColor) ??
              (index === 0 ? readOptionalText(entry.presentation.shiftTextColor) : null) ??
              mobileColors.textPrimary,
            border:
              readOptionalText(segment.jobBorderColor) ??
              (index === 0 ? readOptionalText(entry.presentation.shiftBorderColor) : null) ??
              rawPillColor,
          },
          isDarkTheme,
        )
      : null;

    return {
      key: `${entry.date}-${index}`,
      label,
      jobName,
      timeRangeLabel,
      pill,
    };
  });
}

// One card per day in the period, matching web's MyScheduleRow.tsx DayBox
// strip (apps/web/src/components/dashboard/MyScheduleRow.tsx) — spelled-out
// shift names, swipeable, empty days shown as their own placeholder card
// rather than dropped entirely.
export function MyScheduleCard({
  accessToken,
  onExpand,
}: {
  accessToken: string | null;
  onExpand?: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const isDarkTheme = useIsDarkMode();
  // The screens that render this card fold the same query into their content
  // state, so by the time the card mounts the data is there. No local loading
  // branch: returning null here made the card appear after the page skeleton
  // had cleared, shifting everything below it down.
  const query = useMyScheduleQuery(accessToken);

  const range = query.data?.range;
  const entries = query.data?.entries ?? [];
  const entryByDate = new Map<string, MobileScheduleEntry>(
    entries.map((entry) => [entry.date, entry]),
  );
  const dates = range ? buildDateList(range.startDate, range.endDate) : [];

  return (
    <Card
      title="Your schedule"
      icon="calendar-outline"
      iconTone="brand"
      headerAccessory={
        onExpand ? (
          <ExpandButton accessibilityLabel="Expand your schedule" onPress={onExpand} />
        ) : undefined
      }
      detail={
        dates.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            {dates.map((dateIso) => {
              const entry = entryByDate.get(dateIso);
              const { weekday, dayNumber } = formatDayHeader(dateIso);
              const isAbsence = entry?.state.kind === "absence";
              const segmentPills = buildDaySegmentPills(entry, mobileColors, isDarkTheme);

              return (
                <View key={dateIso} style={styles.dayCard}>
                  <Text style={styles.dayHeader}>
                    {weekday} {dayNumber}
                  </Text>
                  {segmentPills.length > 0 ? (
                    <View style={styles.shiftRow}>
                      {segmentPills.map((segment) => (
                        <View
                          key={segment.key}
                          style={[
                            styles.shiftPill,
                            segment.pill
                              ? {
                                  backgroundColor: segment.pill.color,
                                  borderColor: segment.pill.border,
                                }
                              : null,
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.shiftName,
                              segment.pill ? { color: segment.pill.text } : null,
                            ]}
                          >
                            {segment.label}
                          </Text>
                          {/* Job name and time lines are always rendered (even
                              when absent) so every pill has the same
                              three-line height. */}
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.shiftJobName,
                              segment.pill ? { color: segment.pill.text } : null,
                            ]}
                          >
                            {segment.jobName ?? " "}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.shiftTime,
                              segment.pill ? { color: segment.pill.text } : null,
                            ]}
                          >
                            {segment.timeRangeLabel ?? " "}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyPill}>
                      <Text style={styles.emptyText}>{isAbsence ? "Off" : "—"}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <EmptyStateCard
            compact
            iconName="calendar-outline"
            title="You're not scheduled this week"
          />
        )
      }
    />
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // Cancels Card's own 18px horizontal padding (Screen.tsx's `card` style)
    // so the scroll track itself bleeds edge-to-edge instead of sitting inset —
    // everything else in the card (title, icon) keeps the normal padding. The
    // same 18px comes back as contentContainerStyle padding below, so the
    // first/last day cards still sit inset at rest; only the track between
    // them (visible while actively scrolling) is truly edge-to-edge.
    scrollView: {
      marginHorizontal: -18,
    },
    scrollContent: {
      gap: DAY_CARD_GAP,
      paddingHorizontal: 18,
    },
    dayCard: {
      minWidth: PILL_WIDTH,
      gap: 8,
      backgroundColor: mobileColors.surfaceSecondary,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      borderColor: mobileColors.cardBorder,
      padding: 12,
    },
    dayHeader: {
      ...mobileText.label,
      color: mobileColors.textMuted,
    },
    // Multiple shifts in one day (a "double shift") lay out side by side in
    // this row, rather than stacked, to fit the horizontally-scrolling strip.
    shiftRow: {
      flexDirection: "row",
      gap: PILL_GAP,
    },
    shiftPill: {
      width: PILL_WIDTH,
      gap: 2,
      minHeight: SHIFT_PILL_MIN_HEIGHT,
      justifyContent: "center",
      borderRadius: PILL_RADIUS,
      borderWidth: 1,
      borderColor: mobileColors.border,
      backgroundColor: mobileColors.surface,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    shiftName: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
    },
    shiftJobName: {
      ...mobileTextWeighted("caption", "medium"),
      fontSize: 11,
      lineHeight: 14,
      color: mobileColors.textMuted,
      opacity: 0.85,
    },
    // Explicit smaller size (not mobileText.caption's 12px) so a full time
    // range like "10:00 PM–6:00 AM" fits in the pill's width without
    // ellipsizing.
    shiftTime: {
      ...mobileText.caption,
      fontSize: 11,
      lineHeight: 14,
      color: mobileColors.textMuted,
    },
    emptyPill: {
      width: PILL_WIDTH,
      minHeight: SHIFT_PILL_MIN_HEIGHT,
      justifyContent: "center",
    },
    emptyText: {
      ...mobileText.body,
      color: mobileColors.textSubtle,
    },
  });

import { useMemo } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "../../../shared/components/Text";
import { addDaysToIsoDate, getDaysBetweenIsoDates } from "@dubgrid/schedule-core";
import type {
  MobileScheduleEntry,
  MobileScheduleRange,
  ResolvedSchedulePresentationSegment,
} from "@dubgrid/contracts";
import { resolveShiftPillColors, type ShiftPillColors } from "@dubgrid/design-tokens";
import { DashboardCard } from "./DashboardCard";
import { Pressable } from "../../../shared/components/Pressable";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { getClientFriendlyErrorMessage } from "../../../shared/lib/errors";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  mobileBorderColorFromText,
  mobileElevation,
  mobileRadius,
  mobileText,
  mobileTabularText,
  mobileTextWeighted,
  type MobileColors,
  mobileSpace,
} from "../../../shared/theme/tokens";
import { formatUsTime } from "../../../shared/lib/dates";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { useMyScheduleQuery } from "../hooks/useMyScheduleQuery";

// Kept as narrow as possible while still fitting a full time range like
// "10:00 PM–6:00 AM" on one line at the pill's 11px font — a double shift
// renders two of these side by side, so width matters more here than in a
// single-pill day.
const PILL_WIDTH = 124;
const PILL_GAP = 6;
const DAY_CARD_GAP = 10;
// The pill is now the only bounded shape in the day column, so this is the
// radius the strip reads at rather than a nested corner inside a bigger one.
// The chip step of the shared ramp (card 20 / panel 12 / chip 8).
const PILL_RADIUS = mobileRadius.md;
// The coloured cards' edge, as an alpha of their text colour.
const PILL_EDGE_ALPHA = 0.12;
// Room for the pills' shadow inside the strip. A ScrollView clips at its
// bounds, so without it the cast ends in a hard line under each pill; the
// same room is taken back as a negative margin so the section's rhythm is
// unchanged. The room is asymmetric on purpose: the strip's frame grows by
// the same amount, and a frame reaching up over the "See all" row swallowed
// its taps. Above, only the header gap; below, short of the next section.
const SHADOW_ROOM_TOP = mobileSpace.sm;
const SHADOW_ROOM_BOTTOM = mobileSpace.xl;
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

function formatDayHeader(dateIso: string): {
  weekday: string;
  dayNumber: string;
  spokenDate: string;
} {
  const date = new Date(`${dateIso}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date).toUpperCase();
  const dayNumber = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  // The card's press target reads as the full date, not "TUE 12".
  const spokenDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
  return { weekday, dayNumber, spokenDate };
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
  // Absences are genuine pills, not blanks. An absence carries the absence
  // type's own label and colours on `presentation`, and the schema forbids it
  // any `segments`, so the `[{}]` fallback below resolves the whole pill from
  // the top level — exactly what a single-segment worked day does. Only a
  // `deleted` cell, or no cell at all, is truly unscheduled.
  if (!entry || (entry.state.kind !== "worked" && entry.state.kind !== "absence")) {
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

// One column per day in the period, matching web's MyScheduleRow.tsx DayBox
// strip (apps/web/src/components/dashboard/MyScheduleRow.tsx): spelled-out
// shift names, swipeable, empty days shown as their own placeholder rather
// than dropped entirely. The strip sits straight on the page under its
// title; the pills are the only boxes, so a card around them boxed them
// twice.
export function MyScheduleCard({
  accessToken,
  range: periodRange,
  onExpand,
  onOpenDay,
}: {
  accessToken: string | null;
  /** The dashboard's period, so the strip shows one week or two with it. */
  range?: MobileScheduleRange;
  onExpand?: () => void;
  /** A day card opens the same schedule as See all, on that day. */
  onOpenDay?: (date: string) => void;
}) {
  const mobileColors = useMobileColors();
  const isDarkTheme = useIsDarkMode();
  // The pill's width follows its text: at the larger accessibility sizes a
  // fixed 124pt cut "Day Shift" to "Day..." and the time to its hour. The
  // text itself is capped at MAX_FONT_SCALE, so the width caps there too.
  const { fontScale } = useWindowDimensions();
  const pillWidth = Math.round(PILL_WIDTH * Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE));
  const styles = useMemo(
    () => createStyles(mobileColors, isDarkTheme, pillWidth),
    [mobileColors, isDarkTheme, pillWidth],
  );
  // The screens that render this card fold the same query into their content
  // state, so by the time the card mounts the data is there. No local loading
  // branch: returning null here made the card appear after the page skeleton
  // had cleared, shifting everything below it down.
  const query = useMyScheduleQuery(accessToken, { range: periodRange });

  const range = query.data?.range;
  const entries = query.data?.entries ?? [];
  const entryByDate = new Map<string, MobileScheduleEntry>(
    entries.map((entry) => [entry.date, entry]),
  );
  const dates = range ? buildDateList(range.startDate, range.endDate) : [];

  return (
    <DashboardCard surface={false} title="Your schedule" onOpen={onExpand}>
      {dates.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {dates.map((dateIso) => {
            const entry = entryByDate.get(dateIso);
            const { weekday, dayNumber, spokenDate } = formatDayHeader(dateIso);
            const segmentPills = buildDaySegmentPills(entry, mobileColors, isDarkTheme);

            return (
              <Pressable
                key={dateIso}
                accessibilityLabel={spokenDate}
                accessibilityRole="button"
                disabled={!onOpenDay}
                onPress={() => onOpenDay?.(dateIso)}
                style={({ pressed }) => [styles.dayCard, pressed && styles.dayCardPressed]}
              >
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.dayHeader}>
                  {weekday} {dayNumber}
                </Text>
                {segmentPills.length > 0 ? (
                  <View style={styles.shiftRow}>
                    {segmentPills.map((segment) => (
                      <View
                        key={segment.key}
                        style={[
                          styles.shiftPill,
                          // A tint of the pill's own text, fainter than the
                          // edge other pills wear: `borderSubtle` below is
                          // tuned against white and vanishes on a fill, and
                          // the standard 0.35 read as a drawn outline here.
                          segment.pill
                            ? {
                                backgroundColor: segment.pill.color,
                                borderColor: mobileBorderColorFromText(
                                  segment.pill.text,
                                  PILL_EDGE_ALPHA,
                                ),
                              }
                            : null,
                        ]}
                      >
                        <Text
                          maxFontSizeMultiplier={MAX_FONT_SCALE}
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
                          maxFontSizeMultiplier={MAX_FONT_SCALE}
                          numberOfLines={1}
                          style={[
                            styles.shiftJobName,
                            segment.pill ? { color: segment.pill.text } : null,
                          ]}
                        >
                          {segment.jobName ?? " "}
                        </Text>
                        <Text
                          maxFontSizeMultiplier={MAX_FONT_SCALE}
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
                  // Nothing scheduled at all. Absences no longer land here —
                  // they render as their own coloured pill above.
                  <View style={styles.emptyPill}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.emptyText}>
                      —
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : query.error ? (
        // A failed fetch is not an empty week. This card owns its own query,
        // and the dashboard's content state deliberately excludes its error,
        // so without this branch a dropped request told the user they had no
        // shifts — a wrong answer rather than a missing one, in a scheduling
        // app where that is the whole question.
        <StatusBanner
          actionLabel="Try again"
          body={getClientFriendlyErrorMessage(
            query.error,
            "We couldn't load your schedule right now.",
          )}
          title="Could not load your schedule"
          onAction={() => {
            void query.refetch();
          }}
        />
      ) : (
        <EmptyStateCard
          actionLabel={onExpand ? "View full schedule" : undefined}
          actionVariant="link"
          compact
          iconName="calendar-clear-outline"
          onAction={onExpand}
          title="You're not scheduled this week"
        />
      )}
    </DashboardCard>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean, pillWidth: number) =>
  StyleSheet.create({
    // Cancels the screen gutter so the strip runs to the screen edges; the
    // same gutter comes back as content padding, so the first and last day
    // sit in line with the title at rest and only the track between them
    // (visible while scrolling) is truly edge-to-edge.
    scrollView: {
      marginHorizontal: -getScreenGutter(),
      marginTop: -SHADOW_ROOM_TOP,
      marginBottom: -SHADOW_ROOM_BOTTOM,
    },
    scrollContent: {
      gap: DAY_CARD_GAP,
      paddingHorizontal: getScreenGutter(),
      paddingTop: SHADOW_ROOM_TOP,
      paddingBottom: SHADOW_ROOM_BOTTOM,
    },
    // No box. The shift pill below already carries its own fill and edge, so a
    // hairline around the day only drew a second container inside the card:
    // the day header and the gap between days do that job on their own.
    dayCard: {
      minWidth: pillWidth,
      gap: 8,
    },
    dayCardPressed: {
      opacity: 0.7,
    },
    dayHeader: {
      ...mobileText.label,
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    // Multiple shifts in one day (a "double shift") lay out side by side in
    // this row, rather than stacked, to fit the horizontally-scrolling strip.
    shiftRow: {
      flexDirection: "row",
      gap: PILL_GAP,
    },
    // The pill's own colour is the shape; the quiet `raised` lift and a
    // subtle edge keep it legible when a shift colour lands close to the
    // page behind it.
    shiftPill: {
      width: pillWidth,
      gap: mobileSpace.xs,
      minHeight: SHIFT_PILL_MIN_HEIGHT,
      justifyContent: "center",
      borderRadius: PILL_RADIUS,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      backgroundColor: mobileColors.surface,
      ...mobileElevation("raised", isDark),
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: mobileSpace.sm,
    },
    shiftName: {
      ...mobileText.bodyStrong,
      color: mobileColors.textPrimary,
    },
    shiftJobName: {
      ...mobileTextWeighted("badge", "medium"),
      color: mobileColors.textMuted,
      opacity: 0.85,
    },
    // Explicit smaller size (not mobileText.caption's 12px) so a full time
    // range like "10:00 PM–6:00 AM" fits in the pill's width without
    // ellipsizing.
    shiftTime: {
      ...mobileTextWeighted("badge", "regular"),
      ...mobileTabularText,
      color: mobileColors.textMuted,
    },
    emptyPill: {
      width: pillWidth,
      minHeight: SHIFT_PILL_MIN_HEIGHT,
      justifyContent: "center",
    },
    emptyText: {
      ...mobileText.body,
      color: mobileColors.textSubtle,
    },
  });

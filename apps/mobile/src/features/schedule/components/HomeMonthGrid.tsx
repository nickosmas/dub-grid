import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import {
  addDaysToIsoDate,
  buildUpcomingMeScheduleItems,
  getScheduleEntryAbsenceTypeId,
  getScheduleMonthStartDate,
  isDeletedScheduleHistory,
} from "@dubgrid/schedule-core";
import { FitText } from "../../../shared/components/FitText";
import { Text } from "../../../shared/components/Text";
import { getScreenGutter } from "../../../shared/components/screen-layout";
import { getMySchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";
import { getCalendarDotRanges } from "../lib/schedule";
import {
  getScheduleItemFocusArea,
  getScheduleItemShiftName,
  getScheduleItemTimeRange,
  restOfDayAbsenceTimeLabel,
} from "../lib/scheduleScreenChips";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
/** How far the grid runs from today's month, as Calendar keeps a long run loaded. */
const MONTHS_BACK = 3;
const MONTHS_AHEAD = 6;
const ROW_MIN_HEIGHT = 96;

type GridCard = {
  key: string;
  name: string;
  /** "7:00 AM - 3:30 PM", or "All day" for a whole-day absence: always one line. */
  time: string | null;
  area: string | null;
  fill: string;
  ink: string;
};

/** "2026-11" for a date. */
function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

function addMonths(monthStart: string, months: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, 1));
  return next.toISOString().slice(0, 10);
}

function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDaysToIsoDate(date, -day);
}

/**
 * Home's Month on an open iPhone Duo: one real grid that scrolls up and down
 * through the months as Calendar does. The first of each month says "Dec 1",
 * the month in view is white and the rest a shade darker, and the header's
 * title follows the month in view. Each day shows everything it holds, up to
 * two shifts and an absence, as the web's shift cards: the shift's own colour,
 * name, time and area. Rows grow to fit a busy day.
 */
export function HomeMonthGrid({
  accessToken,
  enabled,
  todayDate,
  visibleMonth,
  scrollRequest,
  onVisibleMonthChange,
  onEntriesChange,
}: {
  accessToken: string | null;
  /** Off for someone with no schedule of their own. */
  enabled: boolean;
  todayDate: string;
  /** The month the title names, "2026-11-01". */
  visibleMonth: string;
  /** A month to bring under the weekday row: the arrows and Today ask for one. */
  scrollRequest: { month: string; nonce: number } | null;
  onVisibleMonthChange: (monthStart: string) => void;
  /** The loaded entries of the month in view, for the header's hours. */
  onEntriesChange?: (entries: MobileScheduleEntry[]) => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  // The hairlines run edge to edge, as Calendar's do; the days stand in at
  // the page's gutter, under the title.
  const gutter = getScreenGutter();
  const inset = { paddingLeft: gutter - mobileSpace.xs, paddingRight: gutter - mobileSpace.xs };
  const insets = useSafeAreaInsets();

  const todayMonth = getScheduleMonthStartDate(todayDate);
  const weeks = useMemo(() => {
    const first = weekStartOf(addMonths(todayMonth, -MONTHS_BACK));
    const lastDay = addDaysToIsoDate(addMonths(todayMonth, MONTHS_AHEAD + 1), -1);
    const out: string[] = [];
    for (let start = first; start <= lastDay; start = addDaysToIsoDate(start, 7)) {
      out.push(start);
    }
    return out;
  }, [todayMonth]);

  // The month in view and one either side, in the schedule API's 31-day blocks.
  const ranges = useMemo(
    () =>
      getCalendarDotRanges(
        addDaysToIsoDate(addMonths(visibleMonth, -1), -7),
        addDaysToIsoDate(addMonths(visibleMonth, 2), 6),
      ),
    [visibleMonth],
  );
  const entries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: mobileQueryKeys.dashboardSchedule(accessToken, range),
      queryFn: ({ signal }: { signal: AbortSignal }) => getMySchedule(accessToken!, range, signal),
      enabled: Boolean(accessToken) && enabled,
    })),
    combine: (results) => results.flatMap((result) => result.data?.entries ?? []),
  });
  const cardsByDate = useMemo(() => buildCardsByDate(entries), [entries]);
  useEffect(() => {
    onEntriesChange?.(
      entries.filter((entry) => monthKeyOf(entry.date) === monthKeyOf(visibleMonth)),
    );
  }, [entries, visibleMonth, onEntriesChange]);

  // Each week's offset in the scroll, for the arrows and the title.
  const rowOffsets = useRef(new Map<string, number>());
  const scrollRef = useRef<ScrollView>(null);
  const [laidOut, setLaidOut] = useState(false);
  // Turning the phone widens the days, so a shrunk time can grow back.
  const [gridWidth, setGridWidth] = useState<number | undefined>(undefined);
  // The month held under the weekday row until the person drags: rows above
  // it grow as their shifts load, which would otherwise push it down.
  const anchorMonth = useRef<string | null>(visibleMonth);
  const scrollToMonth = useCallback(
    (monthStart: string, animated: boolean) => {
      const firstWeek = weeks.find((start) => weekMonthOf(start) === monthStart);
      const y = firstWeek ? rowOffsets.current.get(firstWeek) : undefined;
      if (y !== undefined) scrollRef.current?.scrollTo({ y, animated });
    },
    [weeks],
  );
  useEffect(() => {
    if (laidOut && anchorMonth.current) scrollToMonth(anchorMonth.current, false);
  }, [laidOut, scrollToMonth]);
  useEffect(() => {
    if (!scrollRequest) return;
    anchorMonth.current = scrollRequest.month;
    scrollToMonth(scrollRequest.month, true);
  }, [scrollRequest, scrollToMonth]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y + ROW_MIN_HEIGHT / 2;
    let topWeek: string | null = null;
    for (const start of weeks) {
      const offset = rowOffsets.current.get(start);
      if (offset !== undefined && offset <= y) topWeek = start;
    }
    if (!topWeek) return;
    const month = weekMonthOf(topWeek);
    if (month !== visibleMonth) onVisibleMonthChange(month);
  };

  return (
    <View
      accessibilityLabel="Your schedule by month"
      onLayout={(event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width)}
      style={[
        styles.grid,
        {
          marginLeft: insets.left,
          marginRight: insets.right,
        },
      ]}
    >
      <View style={[styles.weekdayRow, inset]}>
        {WEEKDAY_LABELS.map((label, index) => (
          <Text
            key={index}
            fit="fixed"
            style={[styles.weekdayLabel, (index === 0 || index === 6) && styles.weekend]}
          >
            {label}
          </Text>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + mobileSpace.lg }}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (laidOut && anchorMonth.current) scrollToMonth(anchorMonth.current, false);
        }}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          anchorMonth.current = null;
        }}
      >
        {weeks.map((start, weekIndex) => (
          <View
            key={start}
            onLayout={(event: LayoutChangeEvent) => {
              rowOffsets.current.set(start, event.nativeEvent.layout.y);
              if (weekIndex === weeks.length - 1 && !laidOut) setLaidOut(true);
            }}
            style={[styles.week, inset, weekIndex > 0 && styles.weekDivider]}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
              const date = addDaysToIsoDate(start, offset);
              const inView = monthKeyOf(date) === monthKeyOf(visibleMonth);
              const isToday = date === todayDate;
              const day = Number(date.slice(8, 10));
              const first = day === 1;
              const cards = cardsByDate.get(date) ?? [];
              return (
                <View
                  key={date}
                  accessibilityLabel={`${date}${cards.length ? `, ${cards.map((card) => card.name).join(", ")}` : ""}`}
                  style={styles.cell}
                >
                  <View
                    style={[styles.number, first && styles.numberFirst, isToday && styles.today]}
                  >
                    <Text
                      fit="fixed"
                      style={[
                        styles.numberText,
                        first && styles.numberTextFirst,
                        (offset === 0 || offset === 6) && styles.weekend,
                        !inView && styles.numberOutside,
                        isToday && styles.todayText,
                      ]}
                    >
                      {first ? `${SHORT_MONTHS[Number(date.slice(5, 7)) - 1]} 1` : String(day)}
                    </Text>
                  </View>
                  {cards.map((card) => (
                    <View key={card.key} style={[styles.card, { backgroundColor: card.fill }]}>
                      <Text style={[styles.cardTitle, { color: card.ink }]}>{card.name}</Text>
                      {card.time ? (
                        <FitText
                          align="start"
                          containerWidth={gridWidth}
                          ellipsizeMode="tail"
                          style={[styles.cardLine, { color: card.ink }]}
                        >
                          {card.time}
                        </FitText>
                      ) : null}
                      {card.area ? (
                        <Text style={[styles.cardLine, { color: card.ink }]}>{card.area}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** A week belongs to the month its Wednesday falls in, for the title and the arrows. */
function weekMonthOf(weekStart: string): string {
  return getScheduleMonthStartDate(addDaysToIsoDate(weekStart, 3));
}

/** "7:00 AM - 3:30 PM" reads "7 AM - 3:30 PM", to fit a day's width. */
export function dropZeroMinutes(range: string): string {
  return range.replace(/:00(?= [AP]M)/g, "");
}

/** Each day's cards: its worked shifts, then the absence beside them, or the whole-day absence. */
function buildCardsByDate(entries: readonly MobileScheduleEntry[]): Map<string, GridCard[]> {
  const byDate = new Map<string, GridCard[]>();
  const items = buildUpcomingMeScheduleItems({
    entries: entries.filter((entry) => !isDeletedScheduleHistory(entry)),
    featuredItem: null,
    selectedDate: "",
  });
  for (const item of items) {
    const presentation = item.entry.presentation;
    const isAbsence = getScheduleEntryAbsenceTypeId(item.entry) != null;
    const name = getScheduleItemShiftName(item);
    const range = getScheduleItemTimeRange(item);
    const time = range ? dropZeroMinutes(range) : isAbsence ? "All day" : null;
    const area = isAbsence ? null : getScheduleItemFocusArea(item);
    const cards = byDate.get(item.date) ?? [];
    cards.push({
      key: item.key,
      name,
      time,
      area,
      fill: presentation.shiftColor ?? "#E2E8F0",
      ink: presentation.shiftTextColor ?? "#0F172A",
    });
    byDate.set(item.date, cards);
  }
  for (const entry of entries) {
    const absence = entry.presentation.restOfDayAbsence;
    if (!absence || isDeletedScheduleHistory(entry)) continue;
    const range = restOfDayAbsenceTimeLabel(entry);
    const time = range ? dropZeroMinutes(range) : null;
    const cards = byDate.get(entry.date) ?? [];
    cards.push({
      key: `${entry.employeeId}:${entry.date}:absence`,
      name: absence.name,
      time,
      area: null,
      fill: absence.color ?? "#E2E8F0",
      ink: absence.textColor ?? "#0F172A",
    });
    byDate.set(entry.date, cards);
  }
  return byDate;
}

const NUMBER_SIZE = 32;

// Calendar's month: no outline, card or column lines, only a hairline under
// the weekdays and between weeks, on the page itself.
const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    grid: {
      flex: 1,
      minHeight: 0,
    },
    weekdayRow: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: mobileColors.border,
      paddingVertical: mobileSpace.sm,
    },
    weekdayLabel: {
      ...mobileText.body,
      flex: 1,
      textAlign: "center",
      color: mobileColors.textPrimary,
    },
    weekend: {
      color: mobileColors.textSubtle,
    },
    week: {
      flexDirection: "row",
      minHeight: ROW_MIN_HEIGHT,
    },
    weekDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mobileColors.border,
    },
    cell: {
      flex: 1,
      minWidth: 0,
      gap: mobileSpace.xs,
      paddingHorizontal: mobileSpace.xs,
      paddingTop: mobileSpace.sm,
      paddingBottom: mobileSpace.xs,
    },
    number: {
      alignSelf: "center",
      minWidth: NUMBER_SIZE,
      height: NUMBER_SIZE,
      borderRadius: NUMBER_SIZE / 2,
      paddingHorizontal: mobileSpace.xs,
      alignItems: "center",
      justifyContent: "center",
    },
    numberFirst: {
      paddingHorizontal: mobileSpace.sm,
    },
    today: {
      backgroundColor: mobileColors.brand,
    },
    numberText: {
      ...mobileTextWeighted("title", "semibold"),
      color: mobileColors.textPrimary,
    },
    numberTextFirst: {
      ...mobileTextWeighted("title", "bold"),
    },
    // Lighter than a weekend: another month's days only frame this one.
    numberOutside: {
      color: mobileColors.placeholderText,
    },
    todayText: {
      color: mobileColors.onBrandText,
    },
    card: {
      borderRadius: mobileSpace.xs,
      paddingHorizontal: mobileSpace.xs,
      paddingVertical: mobileSpace.xs,
    },
    cardTitle: {
      ...mobileTextWeighted("meta", "semibold"),
    },
    cardLine: {
      ...mobileTextWeighted("meta", "medium"),
      opacity: 0.8,
    },
  });

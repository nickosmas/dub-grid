import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Screen } from "../../../shared/components/Screen";
import { useListPaneBottom, useSplitLayout } from "../../../shared/layout/SplitView";
import { useWindowTop } from "../../../shared/layout/useWindowTop";
import { Text } from "../../../shared/components/Text";
import { getMySchedule } from "../../../shared/lib/api";
import { mobileQueryKeys } from "../../../shared/lib/mobile-query-keys";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace } from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  buildScheduleMonthDays,
  formatCalendarMonthTitle,
  formatScheduleDayLabel,
  getCalendarDotRanges,
  getScheduleMonthStartDate,
  getScheduledDates,
} from "../lib/schedule";
import {
  MONTH_GRID_ROW_GAP,
  WEEK_STRIP_ROW_HEIGHT,
  createStyles,
} from "../screens/scheduleScreenStyles";
import { MonthDayCell } from "./MonthDayCell";
import { IconControlButton } from "./WeekNavigatorHeader";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * A whole month filling a split view's list pane, as Calendar shows it on an
 * open iPhone Duo: the chosen day circled, today marked, and a dot under each
 * day you work. Choosing a day hands it to the pane beside.
 */
export function MonthCalendarPane({
  selectedDate,
  todayDate,
  now,
  timeZone,
  onSelectDate,
}: {
  selectedDate: string;
  todayDate: string;
  now: Date;
  timeZone: string | null | undefined;
  onSelectDate: (date: string | null) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const linkedEmployee = useBootstrap(accessToken).data?.linkedEmployee ?? null;
  const paneBottom = useListPaneBottom(useSplitLayout());

  const selectedMonth = getScheduleMonthStartDate(selectedDate);
  const [month, setMonth] = useState(selectedMonth);
  // Choosing a day elsewhere (Today, a week on the page beside) brings its
  // month back.
  useEffect(() => setMonth(selectedMonth), [selectedMonth]);

  const weeks = useMemo(
    () => buildScheduleMonthDays(month, selectedDate, timeZone),
    [month, selectedDate, timeZone],
  );
  const dotRanges = useMemo(
    () =>
      getCalendarDotRanges(
        addDaysToIsoDate(weeks[0]?.[0]?.date ?? month, -7),
        addDaysToIsoDate(weeks.at(-1)?.at(-1)?.date ?? month, 7),
      ),
    [weeks, month],
  );
  const scheduledDates = useQueries({
    queries: dotRanges.map((dotRange) => ({
      queryKey: mobileQueryKeys.dashboardSchedule(accessToken, dotRange),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getMySchedule(accessToken!, dotRange, signal),
      enabled: Boolean(accessToken) && linkedEmployee !== null,
    })),
    combine: combineScheduledDates,
  });

  // The weeks share the height under the weekday row, down to the pane's foot
  // (held tall, the fold).
  const gridRef = useRef<View>(null);
  const [gridTop, measureGridTop] = useWindowTop(gridRef, true);
  const rowHeight =
    gridTop === null
      ? WEEK_STRIP_ROW_HEIGHT
      : Math.max(
          WEEK_STRIP_ROW_HEIGHT,
          Math.floor(
            (paneBottom - gridTop - mobileSpace.lg - (weeks.length - 1) * MONTH_GRID_ROW_GAP) /
              weeks.length,
          ),
        );

  const header = (
    <View style={styles.stickyControlsSection}>
      <View style={styles.teamHeaderUtilityRow}>
        <View style={styles.teamHeaderTitleArea}>
          <Text accessibilityRole="header" fit="fixed" style={styles.teamHeaderTitle}>
            {formatCalendarMonthTitle(month, todayDate)}
          </Text>
        </View>
        <View style={styles.teamHeaderActions}>
          <IconControlButton
            accessibilityLabel="Previous month"
            iconName="chevron-back"
            onPress={() => setMonth(addMonthsToIsoDate(month, -1))}
          />
          <IconControlButton
            accessibilityLabel="Next month"
            iconName="chevron-forward"
            onPress={() => setMonth(addMonthsToIsoDate(month, 1))}
          />
          {selectedDate !== todayDate ? (
            <IconControlButton
              accessibilityLabel="Today"
              iconName="refresh-outline"
              iconStyle={selectedDate > todayDate ? styles.iconControlMirrored : undefined}
              onPress={() => onSelectDate(null)}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.calendarPlain}>
        <View style={styles.monthCalendarWeekdays}>
          {WEEKDAY_LABELS.map((label, index) => (
            <Text key={index} fit="fixed" style={styles.monthCalendarWeekdayLabel}>
              {label}
            </Text>
          ))}
        </View>
        <View
          accessibilityLabel="Month calendar"
          ref={gridRef}
          onLayout={measureGridTop}
          style={{ gap: MONTH_GRID_ROW_GAP }}
        >
          {weeks.map((week) => (
            <View key={week[0]?.date ?? "week"} style={styles.monthCalendarWeek}>
              {week.map((day) => (
                <MonthDayCell
                  key={day.date}
                  day={day}
                  dateLabel={formatScheduleDayLabel(day.date, now, timeZone)}
                  isScheduled={scheduledDates.has(day.date)}
                  minHeight={rowHeight}
                  onPress={() => onSelectDate(day.date === todayDate ? null : day.date)}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  return <Screen bottomPaddingMode="tabbed" scrollEnabled={false} stickyHeader={header} />;
}

function combineScheduledDates(
  results: Array<UseQueryResult<Awaited<ReturnType<typeof getMySchedule>>>>,
): Set<string> {
  return getScheduledDates(results.flatMap((result) => result.data?.entries ?? []));
}

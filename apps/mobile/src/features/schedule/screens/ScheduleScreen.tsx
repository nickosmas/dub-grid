import { ScheduleNoteLabels } from "../../../shared/components/ScheduleNoteLabels";
import { scheduleNotesForRow } from "../lib/scheduleNotes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Animated,
  View,
  useWindowDimensions,
  type AppStateStatus,
  type GestureResponderEvent,
} from "react-native";
import { Text } from "../../../shared/components/Text";
import { Pressable } from "../../../shared/components/Pressable";
import { PressableRow } from "../../../shared/components/PressableRow";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Screen, type ScreenScrollHandle } from "../../../shared/components/Screen";
import { PageWash } from "../../../shared/components/PageWash";
import { IS_NATIVE_LIST } from "../../../shared/lib/native-list";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { ScheduleMeSkeleton, ScheduleTeamSkeleton } from "../components/ScheduleSkeleton";
import {
  MeHeroCard,
  OpenShiftsSection,
  ShiftCoverRequestsSection,
  UpcomingShiftsSection,
  JobPill,
  PreviousShiftRow,
  getInitials,
  getSegmentScheduleNotes,
} from "../components/MyScheduleSections";
import {
  AlertsChromeButton,
  IconControlButton,
  WeekNavigatorHeader,
} from "../components/WeekNavigatorHeader";
import { ShiftChangeBadge, getShiftChangeLabel } from "../components/ShiftChangeBadge";
import { SplitShiftBadge } from "../components/SplitShift";
import { getMySchedule, getOrgSchedule, getShiftRequests } from "../../../shared/lib/api";
import { getAvatarTone } from "@dubgrid/design-tokens";
import { hapticSelection } from "../../../shared/lib/haptics";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobileMotion,
  type MobileColors,
  mobileSoftGradientStops,
} from "../../../shared/theme/tokens";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useShiftRequestActionFlow } from "../../shift-requests/hooks/useShiftRequestActionFlow";
import { useMobileShiftRequestsRealtime } from "../../shift-requests/hooks/useMobileShiftRequestsRealtime";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  buildMeShiftRequestSections,
  buildScheduleMonthDays,
  buildScheduleWeekDays,
  buildTeamScheduleFocusAreaTabs,
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  filterScheduleEntriesByDate,
  filterTeamScheduleEntriesByFocusArea,
  formatScheduleDayLabel,
  formatScheduleTimeRange,
  getFeaturedMeScheduleSegment,
  getIsoDateInTimeZone,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCustomStartTime,
  getScheduleEntryCustomTimeRange,
  getScheduleEntryEndTime,
  getScheduleEntrySegments,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
  getScheduleMonthStartDate,
  getScheduleMonthWeekIndexForDate,
  getScheduleRangeForDate,
  getSplitShiftSegmentsForEntry,
  isDeletedScheduleHistory,
  sortScheduleEntries,
  type FeaturedMeScheduleSegment,
  type MobileScheduleMonthDay,
} from "../lib/schedule";
import {
  WEEK_SWIPE_FALLBACK_WIDTH,
  getCurrentTimeValue,
  getSegmentStartTime,
  getSegmentEndTime,
  getHeroTiming,
  getSwipeEventX,
  getSwipeEventTimestamp,
  clampWeekSwipeDelta,
  isCommittedWeekSwipe,
} from "../lib/scheduleScreenHelpers";
import {
  buildAbsenceChip,
  buildGeneralShiftChip,
  buildJobChip,
  getMeHeroShiftmates,
  buildRestOfDayAbsenceChip,
  getScheduleEntrySegmentChange,
  getSegmentJobChip,
  hasMentoredSegments,
  isGeneralShiftSegment,
  type JobChip,
} from "../lib/scheduleScreenChips";

import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";
import { MONTH_GRID_ROW_GAP, WEEK_STRIP_ROW_HEIGHT, createStyles } from "./scheduleScreenStyles";
const MONTH_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_EXPAND_TIMING = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
};
/**
 * Week/month swipe springs, named so the two feels are legible and so the
 * schedule shares the app's motion vocabulary.
 *
 * These stay on the legacy `Animated` API rather than Reanimated: they already
 * run with `useNativeDriver: true`, so the transform is on the UI thread either
 * way, and the gesture is driven by raw touch handlers whose behaviour is
 * covered by tests.
 */
const SWIPE_CANCEL_SPRING = mobileMotion.spring.gentle;
const SWIPE_SETTLE_SPRING = mobileMotion.spring.snappy;

type ScheduleScope = "mine" | "team";
type TeamScheduleShiftRow = {
  alternateShiftTitles: string[];
  entry: MobileScheduleEntry;
  segment: MobileScheduleEntrySegment | null;
};

type TeamScheduleShiftGroup = {
  key: string;
  rows: TeamScheduleShiftRow[];
  sortKey: string;
  timeRange: string | null;
  title: string;
};

function formatScheduleHeaderDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatTeamScheduleHeaderDateLabel(
  date: string,
  today: Date,
  timeZone?: string | null,
): string {
  const isoToday = getIsoDateInTimeZone(today, timeZone);
  const dateLabel = formatScheduleHeaderDate(date);

  if (date === isoToday) {
    return `Today, ${dateLabel}`;
  }

  if (date === addDaysToIsoDate(isoToday, -1)) {
    return `Yesterday, ${dateLabel}`;
  }

  if (date === addDaysToIsoDate(isoToday, 1)) {
    return `Tomorrow, ${dateLabel}`;
  }

  const weekdayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));

  return `${weekdayLabel}, ${dateLabel}`;
}

function normalizeTeamShiftGroupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTeamShiftSegmentTitle(segment: MobileScheduleEntrySegment): string {
  const rawTitle = segment.shiftName?.trim() || segment.label?.trim() || "Shift";
  const jobName = segment.jobName?.trim();

  if (jobName && rawTitle.endsWith(` ${jobName}`)) {
    return rawTitle.slice(0, -jobName.length).trim();
  }

  return rawTitle;
}

function getTeamShiftSegmentGroupKey(segment: MobileScheduleEntrySegment, title: string): string {
  if (segment.shiftId != null) {
    return `shift:${segment.shiftId}`;
  }

  const startTime = segment.shiftStartTime ?? segment.startTime ?? "none";
  const endTime = segment.shiftEndTime ?? segment.endTime ?? "none";
  return `shift-name:${normalizeTeamShiftGroupKey(title)}:${startTime}:${endTime}`;
}

function getTeamShiftSegmentSortKey(
  entry: MobileScheduleEntry,
  segment: MobileScheduleEntrySegment | null,
): string {
  return (
    segment?.shiftStartTime ??
    segment?.startTime ??
    getScheduleEntryStartTime(entry) ??
    getScheduleEntryCustomStartTime(entry) ??
    "99:99:99"
  );
}

function getTeamShiftSegmentTimeRange(segment: MobileScheduleEntrySegment | null): string | null {
  if (!segment) {
    return null;
  }

  return formatScheduleTimeRange(
    segment.shiftStartTime ?? segment.startTime ?? null,
    segment.shiftEndTime ?? segment.endTime ?? null,
  );
}

function getTeamShiftRowTimeRange(
  row: TeamScheduleShiftRow,
  groupTimeRange: string | null,
): string | null {
  const customTimeRange = getScheduleEntryCustomTimeRange(row.entry);
  return customTimeRange && customTimeRange !== groupTimeRange ? customTimeRange : null;
}

function getTeamScheduleEntrySegmentsForCards(
  entry: MobileScheduleEntry,
): MobileScheduleEntrySegment[] {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return [];
  }

  const splitSegments = getSplitShiftSegmentsForEntry(entry);
  if (splitSegments.length > 1) {
    return splitSegments;
  }

  return getScheduleEntrySegments(entry);
}

function formatAlternateShiftTitles(titles: readonly string[]): string | null {
  if (titles.length === 0) {
    return null;
  }

  if (titles.length === 1) {
    return `Also ${titles[0]}`;
  }

  if (titles.length === 2) {
    return `Also ${titles[0]} and ${titles[1]}`;
  }

  return `Also ${titles[0]}, ${titles[1]} +${titles.length - 2} more`;
}

function getTeamShiftRowJobSort(row: TeamScheduleShiftRow): {
  name: string;
  sortOrder: number;
} {
  return {
    name: row.segment?.jobName ?? "",
    sortOrder: row.segment?.jobSortOrder ?? Number.MAX_SAFE_INTEGER,
  };
}

function sortTeamScheduleShiftRows(rows: TeamScheduleShiftRow[]): TeamScheduleShiftRow[] {
  return [...rows].sort((left, right) => {
    const leftJob = getTeamShiftRowJobSort(left);
    const rightJob = getTeamShiftRowJobSort(right);

    if (leftJob.sortOrder !== rightJob.sortOrder) {
      return leftJob.sortOrder - rightJob.sortOrder;
    }

    const jobComparison = leftJob.name.localeCompare(rightJob.name);
    if (jobComparison !== 0) {
      return jobComparison;
    }

    const seniorityComparison =
      (left.entry.employeeSeniority ?? Number.MAX_SAFE_INTEGER) -
      (right.entry.employeeSeniority ?? Number.MAX_SAFE_INTEGER);
    if (seniorityComparison !== 0) {
      return seniorityComparison;
    }

    return left.entry.employeeName.localeCompare(right.entry.employeeName);
  });
}

function buildTeamScheduleShiftGroupsForView(
  entries: ReadonlyArray<MobileScheduleEntry>,
): TeamScheduleShiftGroup[] {
  const groups = new Map<string, TeamScheduleShiftGroup>();

  for (const entry of sortScheduleEntries(entries)) {
    const segments = getTeamScheduleEntrySegmentsForCards(entry);

    if (segments.length === 0) {
      const title = getScheduleEntryTitle(entry);
      const key = `absence:${getScheduleEntryAbsenceTypeId(entry) ?? "none"}:${title}`;
      const sortKey = getTeamShiftSegmentSortKey(entry, null);
      const group =
        groups.get(key) ??
        ({
          key,
          rows: [],
          sortKey,
          timeRange: null,
          title,
        } satisfies TeamScheduleShiftGroup);

      group.rows.push({
        alternateShiftTitles: [],
        entry,
        segment: null,
      });
      if (sortKey.localeCompare(group.sortKey) < 0) {
        group.sortKey = sortKey;
      }
      groups.set(key, group);
      continue;
    }

    const segmentGroups = segments.map((segment) => {
      const title = getTeamShiftSegmentTitle(segment);
      return {
        key: getTeamShiftSegmentGroupKey(segment, title),
        segment,
        sortKey: getTeamShiftSegmentSortKey(entry, segment),
        timeRange: getTeamShiftSegmentTimeRange(segment),
        title,
      };
    });

    for (const segmentGroup of segmentGroups) {
      const group =
        groups.get(segmentGroup.key) ??
        ({
          key: segmentGroup.key,
          rows: [],
          sortKey: segmentGroup.sortKey,
          timeRange: segmentGroup.timeRange,
          title: segmentGroup.title,
        } satisfies TeamScheduleShiftGroup);
      const alternateShiftTitles = segmentGroups
        .filter((candidate) => candidate.key !== segmentGroup.key)
        .map((candidate) => candidate.title)
        .filter(
          (title, index, titles) => title !== segmentGroup.title && titles.indexOf(title) === index,
        );
      const existingRow = group.rows.find((row) => row.entry === entry);

      if (existingRow) {
        existingRow.alternateShiftTitles = Array.from(
          new Set([...existingRow.alternateShiftTitles, ...alternateShiftTitles]),
        );
      } else {
        group.rows.push({
          alternateShiftTitles,
          entry,
          segment: segmentGroup.segment,
        });
      }

      if (segmentGroup.sortKey.localeCompare(group.sortKey) < 0) {
        group.sortKey = segmentGroup.sortKey;
      }
      if (!group.timeRange && segmentGroup.timeRange) {
        group.timeRange = segmentGroup.timeRange;
      }
      groups.set(segmentGroup.key, group);
    }
  }

  return Array.from(groups.values())
    .sort((left, right) => {
      const sortComparison = left.sortKey.localeCompare(right.sortKey);
      if (sortComparison !== 0) {
        return sortComparison;
      }

      return left.title.localeCompare(right.title);
    })
    .map((group) => ({
      ...group,
      rows: sortTeamScheduleShiftRows(group.rows),
    }));
}

export function ScheduleScreen({ scope }: { scope: ScheduleScope }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight, fontScale } = useWindowDimensions();
  // A group's title and time share a row until the reader raises the text
  // size, then the time drops under the title rather than breaking it.
  const stackGroupTime = fontScale > 1;
  const bootstrapQuery = useBootstrap(accessToken);
  const now = useRealtimeNow();
  // A dashboard coverage row opens the team schedule on its focus area. Read
  // as an effect rather than as the state's initial value: the tab screen stays
  // mounted between visits, so a second drill-in arrives as a param change.
  const params = useLocalSearchParams<{
    focusAreaId?: string | string[];
    date?: string | string[];
  }>();
  const requestedFocusAreaId = Array.isArray(params.focusAreaId)
    ? params.focusAreaId[0]
    : params.focusAreaId;
  // An alert about a day lands here with that day; the same rule as the
  // focus area above, since the tab stays mounted between visits.
  const requestedDateParam = Array.isArray(params.date) ? params.date[0] : params.date;
  const requestedDate =
    requestedDateParam && /^\d{4}-\d{2}-\d{2}$/.test(requestedDateParam)
      ? requestedDateParam
      : null;
  const [selectedTeamFocusAreaKey, setSelectedTeamFocusAreaKey] = useState<string | null>(null);
  useEffect(() => {
    if (scope === "team" && requestedFocusAreaId) {
      setSelectedTeamFocusAreaKey(`focus-area:${requestedFocusAreaId}`);
    }
  }, [requestedFocusAreaId, scope]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(requestedDate);
  useEffect(() => {
    if (requestedDate) setSelectedDateOverride(requestedDate);
  }, [requestedDate]);
  const [weekStripWidth, setWeekStripWidth] = useState(0);
  const [weekStripRowHeight, setWeekStripRowHeight] = useState(WEEK_STRIP_ROW_HEIGHT);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<string | null>(null);
  const calendarExpandProgress = useSharedValue(0);
  const calendarDragStartProgress = useSharedValue(0);
  const meScrollViewRef = useRef<ScreenScrollHandle | null>(null);
  const pendingMeScrollKeyRef = useRef<string | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartTimestampRef = useRef<number | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const weekStripTranslateX = useRef(new Animated.Value(0)).current;
  const weekTransitionRef = useRef<Animated.CompositeAnimation | null>(null);
  const monthSwipeStartXRef = useRef<number | null>(null);
  const monthSwipeStartTimestampRef = useRef<number | null>(null);
  const monthSwipeTranslateX = useRef(new Animated.Value(0)).current;
  const monthTransitionRef = useRef<Animated.CompositeAnimation | null>(null);
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const openShiftVisibility = bootstrapQuery.data?.currentOrg.openShiftVisibility;
  const todayDate = getIsoDateInTimeZone(now, timeZone);
  const selectedDate = selectedDateOverride ?? todayDate;
  selectedDateRef.current = selectedDate;
  const range = useMemo(() => getScheduleRangeForDate(selectedDate), [selectedDate]);
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.permissions.canViewSchedule
    : false;
  const isTeamScope = scope === "team";
  const isBlockedTeamView = isTeamScope && !canViewTeamSchedule && Boolean(bootstrapQuery.data);
  // The week is keyed by "today" in the organization's time zone, which
  // bootstrap supplies. Fetching before it arrived keyed the first request
  // by the UTC date, which near the day boundary is the wrong week: a wasted
  // round trip and a skeleton flash on every cold start.
  const hasBootstrap = bootstrapQuery.data !== undefined;
  const canLoadSchedule =
    Boolean(accessToken) && hasBootstrap && (!isTeamScope || canViewTeamSchedule);
  const canLoadRequests = Boolean(accessToken) && hasBootstrap && !isTeamScope;
  const canLoadMeTeamSchedule =
    Boolean(accessToken) && hasBootstrap && !isTeamScope && canViewTeamSchedule;
  // These three are keyed by the visible date range. Without `keepPreviousData`,
  // paging to the next week drops each of them to `isLoading` and flashes a
  // skeleton over a schedule the user was already reading.
  const scheduleQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, scope, range),
    queryFn: ({ signal }) =>
      isTeamScope
        ? getOrgSchedule(accessToken!, range, signal)
        : getMySchedule(accessToken!, range, signal),
    enabled: canLoadSchedule,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const meTeamScheduleQuery = useQuery({
    queryKey: mobileQueryKeys.schedule(accessToken, "team", range),
    queryFn: ({ signal }) => getOrgSchedule(accessToken!, range, signal),
    enabled: canLoadMeTeamSchedule,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const requestsQuery = useQuery({
    queryKey: mobileQueryKeys.shiftRequests(accessToken, range),
    queryFn: ({ signal }) => getShiftRequests(accessToken!, range, signal),
    enabled: canLoadRequests,
    placeholderData: (previousData, previousQuery) =>
      keepPreviousDataForMobileIdentity(accessToken, previousData, previousQuery),
  });
  const refetchBootstrap = bootstrapQuery.refetch;
  const refetchSchedule = scheduleQuery.refetch;
  const refetchMeTeamSchedule = meTeamScheduleQuery.refetch;
  const refetchRequests = requestsQuery.refetch;
  const handleShiftRequestsRealtimeChange = useCallback(() => {
    if (canLoadRequests) {
      void refetchRequests();
    }
  }, [canLoadRequests, refetchRequests]);
  useMobileShiftRequestsRealtime({
    orgId: bootstrapQuery.data?.currentOrg.id ?? null,
    onChange: handleShiftRequestsRealtimeChange,
  });
  const refetchScreenContent = useCallback(async () => {
    const refreshes: Array<Promise<unknown>> = [refetchBootstrap()];

    if (canLoadSchedule) {
      refreshes.push(refetchSchedule());
    }

    if (canLoadRequests) {
      refreshes.push(refetchRequests());
    }

    if (canLoadMeTeamSchedule) {
      refreshes.push(refetchMeTeamSchedule());
    }

    await Promise.all(refreshes);
  }, [
    canLoadMeTeamSchedule,
    canLoadRequests,
    canLoadSchedule,
    isTeamScope,
    refetchBootstrap,
    refetchMeTeamSchedule,
    refetchRequests,
    refetchSchedule,
  ]);
  const manualRefresh = useManualRefresh(refetchScreenContent);
  const { pendingAction, runRequestAction, confirmationModal } = useShiftRequestActionFlow({
    accessToken,
    viewerCanApprove: Boolean(bootstrapQuery.data?.permissions.canApproveShiftRequests),
    onSucceeded: refetchScreenContent,
  });

  const activeData = scheduleQuery.data;
  const scheduleEntries = activeData?.entries ?? [];
  // Paging to another week serves the old week's data as a placeholder until
  // the new one arrives. Filtered to the new dates that is an empty week, so
  // every empty state fired for a beat on each page; the skeleton holds the
  // page instead until the fetch settles.
  const isRangeSwitching =
    scheduleQuery.isPlaceholderData || (canLoadRequests && requestsQuery.isPlaceholderData);
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const unreadNotificationCount = bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const teamHeaderDateLabel = formatTeamScheduleHeaderDateLabel(selectedDate, now, timeZone);
  const isSelectedToday = selectedDate === todayDate;
  // The Today control's arrow points the way today lies: back from a future
  // week, forward from a past one. Ionicons only draws the clockwise arrow,
  // which reads as forward, so the backward one is that glyph mirrored.
  const todayIconStyle = selectedDate > todayDate ? styles.iconControlMirrored : undefined;
  const currentTimeValue = getCurrentTimeValue(now, timeZone);
  const visibleCalendarMonth = calendarMonthAnchor ?? getScheduleMonthStartDate(selectedDate);
  const previousWeekDate = addDaysToIsoDate(selectedDate, -7);
  const nextWeekDate = addDaysToIsoDate(selectedDate, 7);
  const previousWeekDays = useMemo(
    () =>
      buildScheduleWeekDays(getScheduleRangeForDate(previousWeekDate), previousWeekDate, timeZone),
    [previousWeekDate, timeZone],
  );
  const weekDays = useMemo(
    () => buildScheduleWeekDays(range, selectedDate, timeZone),
    [range, selectedDate, timeZone],
  );
  const nextWeekDays = useMemo(
    () => buildScheduleWeekDays(getScheduleRangeForDate(nextWeekDate), nextWeekDate, timeZone),
    [nextWeekDate, timeZone],
  );
  const monthWeeks = useMemo(
    () => buildScheduleMonthDays(visibleCalendarMonth, selectedDate, timeZone),
    [selectedDate, timeZone, visibleCalendarMonth],
  );
  const previousMonthAnchor = addMonthsToIsoDate(visibleCalendarMonth, -1);
  const nextMonthAnchor = addMonthsToIsoDate(visibleCalendarMonth, 1);
  // Only reachable via month-swipe, which only exists once expanded — skip
  // the (non-trivial: ~35-42 Intl.DateTimeFormat calls each) computation
  // otherwise.
  const previousMonthWeeks = useMemo(
    () =>
      isCalendarOpen ? buildScheduleMonthDays(previousMonthAnchor, selectedDate, timeZone) : [],
    [isCalendarOpen, previousMonthAnchor, selectedDate, timeZone],
  );
  const nextMonthWeeks = useMemo(
    () => (isCalendarOpen ? buildScheduleMonthDays(nextMonthAnchor, selectedDate, timeZone) : []),
    [isCalendarOpen, nextMonthAnchor, selectedDate, timeZone],
  );
  const anchorWeekIndex = getScheduleMonthWeekIndexForDate(visibleCalendarMonth, selectedDate);
  // One shared row height for every week row (swipeable or static) so the
  // grid stays perfectly aligned as it slides — no per-row measurement.
  const monthGridRowsHeight =
    monthWeeks.length * weekStripRowHeight +
    Math.max(0, monthWeeks.length - 1) * MONTH_GRID_ROW_GAP;
  const anchorRowOffsetInStack = anchorWeekIndex * (weekStripRowHeight + MONTH_GRID_ROW_GAP);
  // The dates panel clips from a single row's height up to the full month
  // grid height, so when fully expanded every week row is visible.
  const calendarOuterClipAnimatedStyle = useAnimatedStyle(
    () => ({
      height: interpolate(
        calendarExpandProgress.value,
        [0, 1],
        [weekStripRowHeight, monthGridRowsHeight],
        Extrapolation.CLAMP,
      ),
    }),
    [weekStripRowHeight, monthGridRowsHeight],
  );
  // The dates themselves just slide (no opacity/crossfade): the anchor
  // (selected) week starts exactly where the collapsed row sits and moves
  // south into its true row as the rest of the month is revealed.
  const calendarDatesStackAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: interpolate(
            calendarExpandProgress.value,
            [0, 1],
            [-anchorRowOffsetInStack, 0],
          ),
        },
      ],
    }),
    [anchorRowOffsetInStack],
  );
  const selectedDayTeamEntries = useMemo(
    () => (isTeamScope ? filterScheduleEntriesByDate(scheduleEntries, selectedDate) : []),
    [isTeamScope, scheduleEntries, selectedDate],
  );
  const teamFocusAreaTabs = useMemo(() => {
    if (isBlockedTeamView) {
      return [];
    }

    // Tabs come from the whole range so they don't appear and vanish as the
    // user moves between days; the badges count only the selected day.
    return buildTeamScheduleFocusAreaTabs(
      bootstrapQuery.data?.focusAreas ?? [],
      scheduleEntries,
      selectedDayTeamEntries,
    );
  }, [bootstrapQuery.data?.focusAreas, isBlockedTeamView, scheduleEntries, selectedDayTeamEntries]);
  const defaultTeamFocusAreaKey = useMemo(() => {
    const homeFocusAreaId = linkedEmployee?.focusAreaIds[0] ?? null;
    if (homeFocusAreaId != null) {
      const homeFocusAreaKey = `focus-area:${homeFocusAreaId}`;
      if (teamFocusAreaTabs.some((tab) => tab.key === homeFocusAreaKey)) {
        return homeFocusAreaKey;
      }
    }

    return teamFocusAreaTabs.length > 0 ? teamFocusAreaTabs[0].key : null;
  }, [linkedEmployee?.focusAreaIds, teamFocusAreaTabs]);
  const activeTeamFocusAreaKey = teamFocusAreaTabs.some(
    (tab) => tab.key === selectedTeamFocusAreaKey,
  )
    ? selectedTeamFocusAreaKey
    : defaultTeamFocusAreaKey;
  const activeTeamFocusAreaTab =
    teamFocusAreaTabs.find((tab) => tab.key === activeTeamFocusAreaKey) ?? null;

  // `activeTeamFocusAreaKey` above already falls back to the default whenever the
  // selected key is missing or no longer in the tab set, so no effect is needed
  // to "fix up" `selectedTeamFocusAreaKey` — the raw state is only written by the
  // user's tab-tap handler below.

  const activeEntries = useMemo(() => {
    if (!isTeamScope) {
      return scheduleEntries;
    }
    if (!activeTeamFocusAreaKey) {
      return selectedDayTeamEntries;
    }

    return filterTeamScheduleEntriesByFocusArea(selectedDayTeamEntries, activeTeamFocusAreaKey);
  }, [activeTeamFocusAreaKey, isTeamScope, scheduleEntries, selectedDayTeamEntries]);
  const selectedEntries = useMemo(
    () => (isTeamScope ? activeEntries : filterScheduleEntriesByDate(activeEntries, selectedDate)),
    [activeEntries, isTeamScope, selectedDate],
  );
  const meHeroState = useMemo<FeaturedMeScheduleSegment>(
    () =>
      !isTeamScope
        ? getFeaturedMeScheduleSegment({
            entries: activeEntries,
            rangeStartDate: range.startDate,
            selectedDate,
            todayDate,
            currentTime: currentTimeValue,
          })
        : {
            item: null,
            status: "empty",
          },
    [activeEntries, currentTimeValue, isTeamScope, range.startDate, selectedDate, todayDate],
  );
  const meHeroTiming = useMemo(
    () =>
      !isTeamScope && meHeroState.item
        ? getHeroTiming(
            meHeroState.item.entry,
            getSegmentStartTime(meHeroState.item.segment) ??
              getScheduleEntryStartTime(meHeroState.item.entry),
            getSegmentEndTime(meHeroState.item.segment) ??
              getScheduleEntryEndTime(meHeroState.item.entry),
            meHeroState.status,
            todayDate,
            currentTimeValue,
          )
        : null,
    [currentTimeValue, isTeamScope, meHeroState.item, meHeroState.status, todayDate],
  );
  const meHeroShiftmates = useMemo(
    () =>
      !isTeamScope && canLoadMeTeamSchedule
        ? getMeHeroShiftmates(meHeroState.item, meTeamScheduleQuery.data?.entries ?? [])
        : [],
    [canLoadMeTeamSchedule, isTeamScope, meHeroState.item, meTeamScheduleQuery.data?.entries],
  );
  const meUpcomingItems = useMemo(
    () =>
      !isTeamScope
        ? buildUpcomingMeScheduleItems({
            entries: activeEntries,
            featuredItem: meHeroState.item,
            selectedDate,
          })
        : [],
    [activeEntries, isTeamScope, meHeroState.item, selectedDate],
  );
  const isMeScheduleEmpty = !isTeamScope && !meHeroState.item && meUpcomingItems.length === 0;
  // Your Week lists every day of the week, so with nothing scheduled it is
  // seven "Unscheduled" rows under an empty state saying the same thing. A
  // removed shift is history, not a scheduled day; Alerts already announced it.
  const hasScheduledWeekDay = useMemo(
    () => meUpcomingItems.some((item) => !isDeletedScheduleHistory(item.entry)),
    [meUpcomingItems],
  );
  const meEmptyPageMinHeight = Math.max(320, viewportHeight - insets.top - insets.bottom - 180);
  const meRequestSections = useMemo(
    () =>
      !isTeamScope
        ? buildMeShiftRequestSections({
            linkedEmployeeId: linkedEmployee?.id ?? null,
            requests: requestsQuery.data?.requests ?? [],
            now,
            timeZone,
          })
        : {
            coverRequests: [],
            openShiftRequests: [],
          },
    [isTeamScope, linkedEmployee?.id, now, requestsQuery.data?.requests, timeZone],
  );
  const meOpenShifts = !isTeamScope ? (requestsQuery.data?.openShifts ?? []) : [];
  const meWeeklyHours = useMemo(
    () => (!isTeamScope ? buildWeeklyHoursSummary(activeEntries, 40) : null),
    [activeEntries, isTeamScope],
  );
  const shiftGroups = useMemo(
    () => buildTeamScheduleShiftGroupsForView(selectedEntries),
    [selectedEntries],
  );
  // Requests are folded in because the personal view renders cover requests and
  // open shifts inline. Left out, they cleared the page skeleton and then
  // painted two more of their own underneath it. "Resolved" rather than
  // "succeeded": those sections show their own error banner, so a failed
  // request fetch must not take the whole schedule to an error screen.
  // A disabled query never resolves: in team scope `canLoadRequests` is false,
  // so without the short-circuit `hasData` stayed false forever and every error
  // or offline moment repainted the whole tab over a schedule already on
  // screen. Same shape as AdminHomeScreen's `managementOnly ||`.
  const requestsResolved =
    !canLoadRequests || requestsQuery.data !== undefined || Boolean(requestsQuery.error);
  const contentState = useMobileContentState({
    hasData: Boolean(activeData) && Boolean(bootstrapQuery.data) && requestsResolved,
    isLoading: scheduleQuery.isLoading || bootstrapQuery.isLoading || requestsQuery.isLoading,
    error: scheduleQuery.error ?? bootstrapQuery.error,
  });
  const emptyStateTitle = "Nothing to show yet";
  const rawEmptyStateDateLabel = formatScheduleDayLabel(selectedDate, now, timeZone);
  const emptyStateDateLabel = /^(Today|Yesterday|Tomorrow),/.test(rawEmptyStateDateLabel)
    ? rawEmptyStateDateLabel.charAt(0).toLowerCase() + rawEmptyStateDateLabel.slice(1)
    : rawEmptyStateDateLabel;
  const emptyStateBody = isTeamScope
    ? activeTeamFocusAreaTab
      ? `${activeTeamFocusAreaTab.label} has no published shifts for ${emptyStateDateLabel}.`
      : `No shifts have been published for ${emptyStateDateLabel}.`
    : `You have no published shifts for ${emptyStateDateLabel}.`;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void refetchScreenContent();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, refetchScreenContent]);

  useEffect(() => {
    if (isTeamScope) {
      return;
    }

    pendingMeScrollKeyRef.current = `${range.startDate}:${selectedDate}`;
  }, [isTeamScope, range.startDate, selectedDate]);

  useEffect(() => {
    if (isTeamScope || contentState.kind === "loading" || !linkedEmployee) {
      return;
    }

    const scrollRequestKey = `${range.startDate}:${selectedDate}`;
    if (pendingMeScrollKeyRef.current !== scrollRequestKey) {
      return;
    }

    meScrollViewRef.current?.scrollTo({
      y: 0,
      animated: true,
    });
    pendingMeScrollKeyRef.current = null;
  }, [contentState.kind, isTeamScope, linkedEmployee, range.startDate, selectedDate]);

  function closeCalendarExpansion() {
    if (!isCalendarOpen) {
      return;
    }

    calendarExpandProgress.value = withTiming(0, MONTH_EXPAND_TIMING);
    setIsCalendarOpen(false);
    // Browsing months (chevrons or the month swipe) without picking a date
    // leaves calendarMonthAnchor pointed at a month that may not contain
    // selectedDate, which makes anchorWeekIndex resolve out of range and
    // the collapsed week row fail to match any rendered week — a blank
    // strip. Reset so the collapsed view always re-centers on selectedDate.
    setCalendarMonthAnchor(null);
  }

  function getCommittedSelectedDate() {
    return selectedDateRef.current ?? selectedDate;
  }

  function commitSelectedDate(nextDate: string | null) {
    const resolvedNextDate = nextDate ?? todayDate;
    if (selectedDateRef.current !== resolvedNextDate) {
      hapticSelection();
    }
    selectedDateRef.current = resolvedNextDate;
    setSelectedDateOverride(nextDate);
  }

  function handleSelectDate(nextDate: string) {
    commitSelectedDate(nextDate);
    // Not redundant with closeCalendarExpansion's own reset below: that
    // early-returns when the calendar is already collapsed (e.g. tapping a
    // date directly in the week strip), so this is what keeps
    // visibleCalendarMonth correct in that case.
    setCalendarMonthAnchor(getScheduleMonthStartDate(nextDate));
    closeCalendarExpansion();
  }

  function handleOpenShiftDetail(entry: MobileScheduleEntry) {
    router.push({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: entry.employeeId,
        date: entry.date,
        rangeStart: range.startDate,
        rangeEnd: range.endDate,
        source: scope,
      },
    });
  }

  function getWeekSwipeWidth() {
    return weekStripWidth || WEEK_SWIPE_FALLBACK_WIDTH;
  }

  function resetWeekSwipe() {
    weekTransitionRef.current?.stop();
    const resetAnimation = Animated.spring(weekStripTranslateX, {
      toValue: 0,
      ...SWIPE_CANCEL_SPRING,
      useNativeDriver: true,
    });

    weekTransitionRef.current = resetAnimation;
    resetAnimation.start(() => {
      weekTransitionRef.current = null;
    });
  }

  function completeWeekSwipe(direction: -1 | 1, deltaX: number) {
    const nextDate = addDaysToIsoDate(getCommittedSelectedDate(), direction * 7);
    const completeOffset = getWeekSwipeWidth();
    const releaseOffset = clampWeekSwipeDelta(deltaX, completeOffset);
    const rebasedOffset = direction * completeOffset + releaseOffset;

    closeCalendarExpansion();
    weekTransitionRef.current?.stop();
    weekStripTranslateX.setValue(rebasedOffset);
    commitSelectedDate(nextDate);

    const settleAnimation = Animated.spring(weekStripTranslateX, {
      toValue: 0,
      ...SWIPE_SETTLE_SPRING,
      useNativeDriver: true,
    });

    weekTransitionRef.current = settleAnimation;
    settleAnimation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      weekTransitionRef.current = null;
    });
  }

  function handleWeekSwipeEnd(releaseX: number, releaseTimestamp: number | null) {
    if (swipeStartXRef.current == null) {
      return;
    }

    const deltaX = releaseX - swipeStartXRef.current;
    const startTimestamp = swipeStartTimestampRef.current;
    swipeStartXRef.current = null;
    swipeStartTimestampRef.current = null;
    const swipeWidth = getWeekSwipeWidth();
    const elapsedMs =
      releaseTimestamp != null && startTimestamp != null ? releaseTimestamp - startTimestamp : null;

    if (
      !isCommittedWeekSwipe({
        deltaX,
        elapsedMs,
        width: swipeWidth,
      })
    ) {
      resetWeekSwipe();
      return;
    }

    completeWeekSwipe(deltaX < 0 ? 1 : -1, deltaX);
  }

  function handleWeekSwipeStart(event: GestureResponderEvent) {
    if (isCalendarOpen) {
      return;
    }

    weekTransitionRef.current?.stop();
    swipeStartXRef.current = getSwipeEventX(event);
    swipeStartTimestampRef.current = getSwipeEventTimestamp(event);
  }

  function handleWeekSwipeMove(event: GestureResponderEvent) {
    if (isCalendarOpen || swipeStartXRef.current == null) {
      return;
    }

    const moveX = getSwipeEventX(event);
    if (moveX == null) {
      return;
    }

    weekStripTranslateX.setValue(
      clampWeekSwipeDelta(moveX - swipeStartXRef.current, getWeekSwipeWidth()),
    );
  }

  function handleWeekSwipeRelease(event: GestureResponderEvent) {
    const releaseX = getSwipeEventX(event);
    if (releaseX == null) {
      swipeStartXRef.current = null;
      swipeStartTimestampRef.current = null;
      return;
    }

    handleWeekSwipeEnd(releaseX, getSwipeEventTimestamp(event));
  }

  function handleWeekSwipeCancel() {
    swipeStartXRef.current = null;
    swipeStartTimestampRef.current = null;
    resetWeekSwipe();
  }

  function getMonthSwipeWidth() {
    return weekStripWidth || WEEK_SWIPE_FALLBACK_WIDTH;
  }

  function resetMonthSwipe() {
    monthTransitionRef.current?.stop();
    const resetAnimation = Animated.spring(monthSwipeTranslateX, {
      toValue: 0,
      ...SWIPE_CANCEL_SPRING,
      useNativeDriver: true,
    });

    monthTransitionRef.current = resetAnimation;
    resetAnimation.start(() => {
      monthTransitionRef.current = null;
    });
  }

  function completeMonthSwipe(direction: -1 | 1, deltaX: number) {
    const completeOffset = getMonthSwipeWidth();
    const releaseOffset = clampWeekSwipeDelta(deltaX, completeOffset);
    const rebasedOffset = direction * completeOffset + releaseOffset;

    monthTransitionRef.current?.stop();
    monthSwipeTranslateX.setValue(rebasedOffset);
    // visibleCalendarMonth is always the 1st of its month, so this lands
    // exactly on the 1st of the month being swiped to. Selecting it (not
    // just browsing, as the chevrons do) keeps selectedDate inside the
    // visible month, so anchorWeekIndex stays valid once collapsed.
    const nextMonthStartDate = addMonthsToIsoDate(visibleCalendarMonth, direction);
    const isTargetCurrentMonth = nextMonthStartDate === getScheduleMonthStartDate(todayDate);
    setCalendarMonthAnchor(nextMonthStartDate);
    commitSelectedDate(isTargetCurrentMonth ? todayDate : nextMonthStartDate);

    const settleAnimation = Animated.spring(monthSwipeTranslateX, {
      toValue: 0,
      ...SWIPE_SETTLE_SPRING,
      useNativeDriver: true,
    });

    monthTransitionRef.current = settleAnimation;
    settleAnimation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      monthTransitionRef.current = null;
    });
  }

  function handleMonthSwipeEnd(releaseX: number, releaseTimestamp: number | null) {
    if (monthSwipeStartXRef.current == null) {
      return;
    }

    const deltaX = releaseX - monthSwipeStartXRef.current;
    const startTimestamp = monthSwipeStartTimestampRef.current;
    monthSwipeStartXRef.current = null;
    monthSwipeStartTimestampRef.current = null;
    const swipeWidth = getMonthSwipeWidth();
    const elapsedMs =
      releaseTimestamp != null && startTimestamp != null ? releaseTimestamp - startTimestamp : null;

    if (
      !isCommittedWeekSwipe({
        deltaX,
        elapsedMs,
        width: swipeWidth,
      })
    ) {
      resetMonthSwipe();
      return;
    }

    completeMonthSwipe(deltaX < 0 ? 1 : -1, deltaX);
  }

  function handleMonthSwipeStart(event: GestureResponderEvent) {
    if (!isCalendarOpen) {
      return;
    }

    monthTransitionRef.current?.stop();
    monthSwipeStartXRef.current = getSwipeEventX(event);
    monthSwipeStartTimestampRef.current = getSwipeEventTimestamp(event);
  }

  function handleMonthSwipeMove(event: GestureResponderEvent) {
    if (!isCalendarOpen || monthSwipeStartXRef.current == null) {
      return;
    }

    const moveX = getSwipeEventX(event);
    if (moveX == null) {
      return;
    }

    monthSwipeTranslateX.setValue(
      clampWeekSwipeDelta(moveX - monthSwipeStartXRef.current, getMonthSwipeWidth()),
    );
  }

  function handleMonthSwipeRelease(event: GestureResponderEvent) {
    const releaseX = getSwipeEventX(event);
    if (releaseX == null) {
      monthSwipeStartXRef.current = null;
      monthSwipeStartTimestampRef.current = null;
      return;
    }

    handleMonthSwipeEnd(releaseX, getSwipeEventTimestamp(event));
  }

  function handleMonthSwipeCancel() {
    monthSwipeStartXRef.current = null;
    monthSwipeStartTimestampRef.current = null;
    resetMonthSwipe();
  }

  function handlePreviousWeek() {
    closeCalendarExpansion();
    commitSelectedDate(addDaysToIsoDate(getCommittedSelectedDate(), -7));
  }

  function handleNextWeek() {
    closeCalendarExpansion();
    commitSelectedDate(addDaysToIsoDate(getCommittedSelectedDate(), 7));
  }

  function handleGoToToday() {
    closeCalendarExpansion();
    commitSelectedDate(null);
  }

  function handleCalendarDragStart() {
    if (!isCalendarOpen) {
      setCalendarMonthAnchor(getScheduleMonthStartDate(selectedDate));
    }
  }

  function handleCalendarDragEnd(nextIsOpen: boolean) {
    setIsCalendarOpen(nextIsOpen);
    if (!nextIsOpen) {
      // Same reset as closeCalendarExpansion — dragging the handle closed
      // is the primary way users collapse the calendar, so it needs the
      // same re-centering or a month browsed via swipe/chevrons leaves
      // anchorWeekIndex pointing outside monthWeeks and the strip goes blank.
      setCalendarMonthAnchor(null);
    }
  }

  function handleSelectFocusArea(nextFocusAreaKey: string) {
    setSelectedTeamFocusAreaKey(nextFocusAreaKey);
    closeCalendarExpansion();
  }

  const weekStripRenderWidth = weekStripWidth || WEEK_SWIPE_FALLBACK_WIDTH;
  const weekStripRows = [
    {
      key: "previous",
      days: previousWeekDays,
    },
    {
      key: "current",
      days: weekDays,
    },
    {
      key: "next",
      days: nextWeekDays,
    },
  ];
  const calendarDragRange = Math.max(1, monthGridRowsHeight - weekStripRowHeight);
  const calendarDragGesture = Gesture.Pan()
    .onStart(() => {
      "worklet";
      cancelAnimation(calendarExpandProgress);
      calendarDragStartProgress.value = calendarExpandProgress.value;
      runOnJS(handleCalendarDragStart)();
    })
    .onUpdate((event) => {
      "worklet";
      const nextProgress = calendarDragStartProgress.value + event.translationY / calendarDragRange;
      calendarExpandProgress.value = Math.min(1, Math.max(0, nextProgress));
    })
    .onEnd((event) => {
      "worklet";
      const shouldOpen =
        event.velocityY > 600
          ? true
          : event.velocityY < -600
            ? false
            : calendarExpandProgress.value > 0.5;
      calendarExpandProgress.value = withTiming(shouldOpen ? 1 : 0, MONTH_EXPAND_TIMING);
      runOnJS(handleCalendarDragEnd)(shouldOpen);
    });

  const meStickyHeader = !isTeamScope ? (
    <WeekNavigatorHeader
      now={now}
      range={range}
      selectedDate={selectedDate}
      timeZone={timeZone}
      todayDate={todayDate}
      unreadCount={unreadNotificationCount}
      onNextWeek={handleNextWeek}
      onPreviousWeek={handlePreviousWeek}
      onToday={handleGoToToday}
    />
  ) : undefined;

  function renderMonthWeeks(weeks: MobileScheduleMonthDay[][], isCenterMonth: boolean) {
    return weeks.map((week, weekIndex) => {
      if (isCenterMonth && weekIndex === anchorWeekIndex) {
        return (
          <View
            key="anchor-week"
            accessibilityLabel="Schedule week strip"
            onLayout={(event) => {
              setWeekStripRowHeight(event.nativeEvent.layout.height);
            }}
            onTouchCancel={handleWeekSwipeCancel}
            onTouchEnd={handleWeekSwipeRelease}
            onTouchMove={handleWeekSwipeMove}
            onTouchStart={handleWeekSwipeStart}
            style={styles.weekSwipeRowClip}
          >
            <Animated.View
              style={[
                styles.weekStripTrack,
                {
                  width: weekStripRenderWidth * weekStripRows.length,
                  transform: [
                    { translateX: -weekStripRenderWidth },
                    { translateX: weekStripTranslateX },
                  ],
                },
              ]}
            >
              {weekStripRows.map((row) => (
                <View
                  key={row.key}
                  style={[styles.monthCalendarWeek, { width: weekStripRenderWidth }]}
                >
                  {row.days.map((day) => (
                    <MonthDayCell
                      key={day.date}
                      day={{
                        ...day,
                        // buildScheduleWeekDays doesn't compute this, so it's
                        // always undefined here — derive it so leading/
                        // trailing days gray out in month view. In week view
                        // every date should read at full prominence, so
                        // month membership is ignored while collapsed.
                        isCurrentMonth:
                          !isCalendarOpen ||
                          getScheduleMonthStartDate(day.date) === visibleCalendarMonth,
                      }}
                      accessible={row.key === "current"}
                      dateLabel={formatScheduleDayLabel(day.date, now, timeZone)}
                      onPress={() => handleSelectDate(day.date)}
                    />
                  ))}
                </View>
              ))}
            </Animated.View>
          </View>
        );
      }

      return (
        <View key={week[0]?.date ?? "week"} style={styles.monthCalendarWeek}>
          {week.map((day) => (
            <MonthDayCell
              key={day.date}
              day={day}
              accessible={isCenterMonth}
              dateLabel={formatScheduleDayLabel(day.date, now, timeZone)}
              onPress={() => handleSelectDate(day.date)}
            />
          ))}
        </View>
      );
    });
  }

  const stickyHeader = isTeamScope ? (
    <View style={styles.stickyControlsSection}>
      <View style={styles.teamHeaderUtilityRow}>
        <View style={styles.teamHeaderTitleArea}>
          <Text fit="fixed" style={styles.teamHeaderTitle}>
            {teamHeaderDateLabel}
          </Text>
        </View>
        <View style={styles.teamHeaderActions}>
          {/* The same control as Home's, so the two headers read as one set. */}
          {!isSelectedToday ? (
            <IconControlButton
              accessibilityLabel="Today"
              iconName="refresh-outline"
              iconStyle={todayIconStyle}
              onPress={handleGoToToday}
            />
          ) : null}
          <AlertsChromeButton unreadCount={unreadNotificationCount} />
        </View>
      </View>

      <View style={styles.calendarBlock}>
        {/* Weekday labels: always visible, fixed in place — never move. */}
        <View style={styles.monthCalendarWeekdays}>
          {MONTH_WEEKDAY_LABELS.map((label) => (
            <Text key={label} fit="fixed" style={styles.monthCalendarWeekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        {/* Dates: the selected week starts at the strip's position and
            moves south into its true row as the full month is revealed —
            a plain slide, no fading. */}
        <Reanimated.View
          accessibilityLabel="Schedule month grid"
          onLayout={(event) => {
            setWeekStripWidth(event.nativeEvent.layout.width);
          }}
          onTouchCancel={handleMonthSwipeCancel}
          onTouchEnd={handleMonthSwipeRelease}
          onTouchMove={handleMonthSwipeMove}
          onTouchStart={handleMonthSwipeStart}
          style={[styles.weekStripFrame, calendarOuterClipAnimatedStyle]}
        >
          <Reanimated.View style={[styles.monthCalendarWeeks, calendarDatesStackAnimatedStyle]}>
            <Animated.View
              style={[
                styles.monthSwipeTrack,
                {
                  width: weekStripRenderWidth * 3,
                  transform: [
                    { translateX: -weekStripRenderWidth },
                    { translateX: monthSwipeTranslateX },
                  ],
                },
              ]}
            >
              <View style={[styles.monthGridColumn, { width: weekStripRenderWidth }]}>
                {renderMonthWeeks(previousMonthWeeks, false)}
              </View>
              <View style={[styles.monthGridColumn, { width: weekStripRenderWidth }]}>
                {renderMonthWeeks(monthWeeks, true)}
              </View>
              <View style={[styles.monthGridColumn, { width: weekStripRenderWidth }]}>
                {renderMonthWeeks(nextMonthWeeks, false)}
              </View>
            </Animated.View>
          </Reanimated.View>
        </Reanimated.View>

        <GestureDetector gesture={calendarDragGesture}>
          <View
            accessibilityLabel={isCalendarOpen ? "Collapse month calendar" : "Open month calendar"}
            accessibilityRole="adjustable"
            hitSlop={{ top: 8, bottom: 16, left: 40, right: 40 }}
            style={styles.calendarDragHandleRow}
          >
            <View style={styles.calendarDragHandleBar} />
          </View>
        </GestureDetector>
      </View>
    </View>
  ) : (
    meStickyHeader
  );

  // On the web build the staff home sits on the brand aurora, the login
  // page's wash. On device every page is the plain grouped gray, the team
  // schedule always so.
  const homeWash =
    isTeamScope || IS_NATIVE_LIST ? undefined : (
      <PageWash colors={mobileSoftGradientStops("aurora", isDark)} height={viewportHeight} />
    );

  return (
    <Screen
      bottomPaddingMode="tabbed"
      pageBackground={homeWash}
      stickyHeaderBackground={homeWash}
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      // A skeleton is a placeholder, not content: it must not scroll, and there
      // is nothing to pull-to-refresh while the thing is already loading.
      // Everything else scrolls — `Screen`'s `flexGrow: 1` gives a `fillScreen`
      // state real space to centre in without leaving scroll mode.
      scrollEnabled={contentState.kind !== "loading"}
      scrollViewRef={!isTeamScope ? meScrollViewRef : undefined}
      stickyHeader={stickyHeader}
    >
      <View>
        {/* The focus-area pills carry per-day counts, so they can't paint before
            the schedule resolves without every badge popping in behind them.
            While loading there is no tab list yet either — it comes from
            bootstrap — so the skeleton stands in at a fixed width. */}
        {isTeamScope && contentState.kind === "loading" ? (
          contentState.showSkeleton ? (
            <ScrollableTabStripSkeleton tabs={4} />
          ) : null
        ) : isTeamScope && teamFocusAreaTabs.length > 0 ? (
          <ScrollableTabStrip
            accessibilityLabel={bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Areas"}
            activeKey={activeTeamFocusAreaKey}
            onSelect={handleSelectFocusArea}
            tabs={teamFocusAreaTabs}
          />
        ) : null}
        {contentState.kind === "loading" || isRangeSwitching ? (
          isRangeSwitching || (contentState.kind === "loading" && contentState.showSkeleton) ? (
            isTeamScope ? (
              <ScheduleTeamSkeleton />
            ) : (
              <ScheduleMeSkeleton />
            )
          ) : null
        ) : contentState.kind === "error" ? (
          <StatusBanner
            actionLabel="Try again"
            body={contentState.message}
            fillScreen
            title="Couldn't load schedule"
            variant="centered"
            onAction={() => refetchScreenContent()}
          />
        ) : isBlockedTeamView ? (
          <EmptyStateCard
            fillScreen
            body="You don't have permission to view the team schedule. Ask an admin if you need access."
            iconName="lock-closed-outline"
            title="Team schedule unavailable"
          />
        ) : !isTeamScope && !linkedEmployee ? (
          <EmptyStateCard
            fillScreen
            body={
              canManageEmployees
                ? "Open the People tab to link your account to a staff profile. This page will update automatically once you're done."
                : "Ask an admin to finish setting up your account. This page will update automatically once they're done."
            }
            iconName="person-add-outline"
            title="Your account isn't linked yet"
          />
        ) : !isTeamScope ? (
          <View
            style={[
              styles.mePage,
              isMeScheduleEmpty && [styles.mePageEmpty, { minHeight: meEmptyPageMinHeight }],
            ]}
          >
            <MeHeroCard
              currentDate={todayDate}
              currentTime={currentTimeValue}
              featuredItem={meHeroState.item}
              hasWeekItems={hasScheduledWeekDay}
              timing={meHeroTiming}
              shiftmates={meHeroShiftmates}
              status={meHeroState.status}
              onPress={
                meHeroState.item ? () => handleOpenShiftDetail(meHeroState.item!.entry) : undefined
              }
            />
            {!isMeScheduleEmpty ? (
              <>
                <ShiftCoverRequestsSection
                  linkedEmployeeId={linkedEmployee?.id ?? null}
                  pendingAction={pendingAction}
                  onRespond={(requestId, accept) => {
                    if (!linkedEmployee?.id) {
                      return;
                    }

                    runRequestAction(requestId, {
                      action: "respond",
                      empId: linkedEmployee.id,
                      accept,
                    });
                  }}
                  requests={meRequestSections.coverRequests}
                  requestsError={requestsQuery.error}
                />
                <OpenShiftsSection
                  linkedEmployeeId={linkedEmployee?.id ?? null}
                  pendingAction={pendingAction}
                  now={now}
                  onClaim={(requestId) => {
                    if (!linkedEmployee?.id) {
                      return;
                    }

                    runRequestAction(requestId, {
                      action: "claim",
                      claimerEmpId: linkedEmployee.id,
                    });
                  }}
                  onVolunteer={(openShift) => {
                    if (!linkedEmployee?.id) {
                      return;
                    }

                    runRequestAction(openShift.id, {
                      action: "volunteer_open_shift",
                      empId: linkedEmployee.id,
                      shiftDate: openShift.date,
                      focusAreaId: openShift.focusAreaId,
                      state: openShift.state,
                    });
                  }}
                  onSeeAll={() => router.push("/(tabs)/requests")}
                  openShifts={meOpenShifts}
                  requests={meRequestSections.openShiftRequests}
                  requestsError={requestsQuery.error}
                  scheduleEntries={scheduleEntries}
                  timeZone={timeZone}
                  openShiftVisibility={openShiftVisibility}
                />
              </>
            ) : null}
            {hasScheduledWeekDay ? (
              <UpcomingShiftsSection
                items={meUpcomingItems}
                onPressEntry={handleOpenShiftDetail}
                summary={meWeeklyHours}
                todayDate={todayDate}
                weekDays={weekDays}
              />
            ) : null}
          </View>
        ) : shiftGroups.length === 0 ? (
          <EmptyStateCard
            fillScreen
            body={emptyStateBody}
            iconName="calendar-clear-outline"
            title={emptyStateTitle}
          />
        ) : (
          <View style={styles.shiftGroupsList}>
            {shiftGroups.map((group, index) => {
              const groupTimeRange = group.timeRange;

              return (
                <View key={group.key} style={styles.shiftGroupBlock}>
                  {/* Grouped lists part their groups with space alone. */}
                  {index > 0 && !IS_NATIVE_LIST ? <View style={styles.shiftGroupDivider} /> : null}
                  <View
                    style={[
                      styles.shiftGroupHeader,
                      stackGroupTime && styles.shiftGroupHeaderStacked,
                    ]}
                  >
                    <Text style={styles.shiftGroupTitle}>{group.title}</Text>
                    {groupTimeRange ? (
                      <Text
                        style={[
                          styles.shiftGroupTime,
                          stackGroupTime && styles.shiftGroupTimeStacked,
                        ]}
                      >
                        {groupTimeRange}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.teamGroupCard}>
                    <View style={styles.teamGroupMembers}>
                      {group.rows.map((row, memberIndex) => (
                        <TeamShiftMemberRow
                          key={`${row.entry.employeeId}-${row.entry.date}-${group.key}`}
                          groupTimeRange={groupTimeRange}
                          isFirst={memberIndex === 0}
                          linkedEmployeeId={linkedEmployee?.id ?? null}
                          tabFocusAreaId={
                            typeof activeTeamFocusAreaTab?.focusAreaId === "number"
                              ? activeTeamFocusAreaTab.focusAreaId
                              : undefined
                          }
                          row={row}
                          onPress={() => handleOpenShiftDetail(row.entry)}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {confirmationModal}
      </View>
    </Screen>
  );
}

type MonthDayCellDay = {
  date: string;
  dayLabel: string;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth?: boolean;
};

// Shared by the week strip's single row and the full month grid so the
// highlight is always the same circle, in the same place, at the same size.
function MonthDayCell({
  day,
  dateLabel,
  onPress,
  accessible = true,
}: {
  day: MonthDayCellDay;
  /** Human-readable date, e.g. "Today, Apr 16" — see the label below. */
  dateLabel: string;
  onPress: () => void;
  // The week-swipe strip always keeps the previous/next week mounted
  // off-screen (clipped horizontally) so a swipe can start instantly. Those
  // copies duplicate a week that's already accessible in the full month
  // grid, so they're excluded from the accessibility tree.
  accessible?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <Pressable
      // `day.date` is a raw ISO string; screen readers announce it digit by
      // digit ("Select date 2026-08-03"). Speak it the way the UI reads it.
      accessibilityLabel={accessible ? `Select ${dateLabel}` : undefined}
      accessibilityRole={accessible ? "button" : undefined}
      accessibilityState={accessible ? { selected: day.isSelected } : undefined}
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
      onPress={onPress}
      style={styles.monthCalendarDaySlot}
    >
      <View
        style={[
          styles.dateHighlightCircle,
          day.isSelected && !day.isToday && styles.dateHighlightSelected,
          day.isSelected && day.isToday && styles.dateHighlightTodaySelected,
          day.isToday && !day.isSelected && styles.dateHighlightToday,
          day.isCurrentMonth === false && styles.dateHighlightOutsideMonth,
        ]}
      >
        <Text
          fit="fixed"
          style={[
            styles.dateHighlightText,
            day.isSelected && !day.isToday && styles.dateHighlightTextSelected,
            day.isToday && !day.isSelected && styles.dateHighlightTextToday,
            day.isSelected && day.isToday && styles.dateHighlightTextTodaySelected,
          ]}
        >
          {day.dayLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeScheduleScreen() {
  return <ScheduleScreen scope="mine" />;
}

export function TeamScheduleScreen() {
  return <ScheduleScreen scope="team" />;
}

export default TeamScheduleScreen;

function TeamShiftMemberRow({
  groupTimeRange,
  isFirst,
  linkedEmployeeId,
  tabFocusAreaId,
  row,
  onPress,
}: {
  groupTimeRange: string | null;
  isFirst: boolean;
  linkedEmployeeId: string | null;
  /** The selected focus-area tab's area, when it names one. */
  tabFocusAreaId?: number;
  row: TeamScheduleShiftRow;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { entry, segment } = row;
  const avatarTone = getAvatarTone(entry.employeeId, isDark);
  const memberName = entry.employeeId === linkedEmployeeId ? "You" : entry.employeeName;
  const memberTimeRange = getTeamShiftRowTimeRange(row, groupTimeRange);
  const alternateShiftLabel = formatAlternateShiftTitles(row.alternateShiftTitles);
  const roleChip = getTeamMemberRoleChip(mobileColors, isDark, entry, segment);
  const change = segment ? getScheduleEntrySegmentChange(entry, segment) : entry.change;
  // One chip, not two: as on Home's Your Week rows, a split shift folds the
  // change word into its own label ("Also Day Shift · New") instead of
  // stacking a second chip under the name.
  const changeLabel = getShiftChangeLabel(change);
  const splitChipLabel =
    alternateShiftLabel && changeLabel
      ? `${alternateShiftLabel} · ${changeLabel}`
      : alternateShiftLabel;
  const isMentored = segment
    ? segment.isMentored === true
    : hasMentoredSegments(getScheduleEntrySegments(entry));
  // Once the reader raises the text size the role pill moves under the name:
  // the two no longer share a row's width, so neither has to give.
  const stackRolePill = useWindowDimensions().fontScale > 1;
  // A double shift gives each note to one half; a single shift in a focus-area
  // tab lists that area's notes, and the all tab every note.
  const isSplitEntry = getScheduleEntrySegments(entry).length > 1;
  const notes = isDeletedScheduleHistory(entry)
    ? []
    : isSplitEntry
      ? getSegmentScheduleNotes(entry, segment)
      : scheduleNotesForRow(entry.indicators, tabFocusAreaId);
  // A worked cell's absence for the rest of the day follows the shift's pill.
  const restOfDayChip = buildRestOfDayAbsenceChip(mobileColors, isDark, entry);
  const rolePill =
    roleChip || isMentored || restOfDayChip ? (
      <View style={[styles.teamMemberRoleRow, stackRolePill && styles.teamMemberRoleRowStacked]}>
        {roleChip || isMentored ? (
          <JobPill chip={roleChip} compact eyebrowDisplay="outside" isMentored={isMentored} />
        ) : null}
        {restOfDayChip ? <JobPill chip={restOfDayChip} compact eyebrowDisplay="outside" /> : null}
      </View>
    ) : null;

  return (
    <View>
      {isFirst ? null : <View style={styles.teamMemberSeparator} />}
      <PressableRow onPress={onPress} style={styles.teamMemberRow}>
        <View
          style={[
            styles.teamMemberAvatar,
            {
              backgroundColor: avatarTone.backgroundColor,
              borderColor: avatarTone.borderColor,
            },
          ]}
        >
          <Text fit="fixed" style={[styles.teamMemberAvatarText, { color: avatarTone.textColor }]}>
            {getInitials(entry.employeeName)}
          </Text>
        </View>
        <View style={styles.teamMemberCopy}>
          {/* The role pill shares the name's line and the tags take the full
            width beneath, so a split chip is never squeezed into the column
            beside the pill and cut to "Also Day Shift ·…". */}
          <View style={styles.teamMemberHeaderRow}>
            <View style={styles.teamMemberNameRow}>
              <Text style={styles.teamMemberName}>{memberName}</Text>
              <ShiftChangeBadge change={splitChipLabel ? null : change} />
            </View>
            {stackRolePill ? null : rolePill}
          </View>
          {memberTimeRange ? <Text style={styles.teamMemberTime}>{memberTimeRange}</Text> : null}
          <ScheduleNoteLabels notes={notes} />
          <PreviousShiftRow change={change} />
          {splitChipLabel ? (
            <View style={styles.teamMemberSplitBadgeRow}>
              <SplitShiftBadge count={row.alternateShiftTitles.length + 1} label={splitChipLabel} />
            </View>
          ) : null}
          {stackRolePill ? rolePill : null}
        </View>
      </PressableRow>
    </View>
  );
}

function getTeamMemberRoleChip(
  mobileColors: MobileColors,
  isDark: boolean,
  entry: MobileScheduleEntry,
  segment?: MobileScheduleEntrySegment | null,
): JobChip | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return buildAbsenceChip(mobileColors, isDark, getScheduleEntryTitle(entry), entry.presentation);
  }

  if (segment) {
    return getSegmentJobChip(mobileColors, isDark, segment);
  }

  const primarySegment = getScheduleEntrySegments(entry)[0] ?? null;
  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getScheduleEntryTitle(entry),
      primarySegment,
    );
  }

  const jobSegment = getScheduleEntrySegments(entry).find((item) => item.jobName) ?? null;
  return buildJobChip(mobileColors, isDark, jobSegment?.jobName ?? null, jobSegment);
}

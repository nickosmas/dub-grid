import { ActionButtons } from "../../../shared/components/ActionButtons";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  AppState,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AppStateStatus,
  type GestureResponderEvent,
} from "react-native";
import { Pressable } from "../../../shared/components/Pressable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
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
import { BottomSheetModal, SheetHeader } from "../../../shared/components/BottomSheetModal";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { NumericBadge } from "../../../shared/components/NumericBadge";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import { Card, Screen, type ScreenScrollHandle } from "../../../shared/components/Screen";
import { PageWash } from "../../../shared/components/PageWash";
import {
  ScrollableTabStrip,
  ScrollableTabStripSkeleton,
} from "../../../shared/components/ScrollableTabStrip";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import { ScheduleMeSkeleton, ScheduleTeamSkeleton } from "../components/ScheduleSkeleton";
import { ShiftChangeBadge, getShiftChangeLabel } from "../components/ShiftChangeBadge";
import { SplitShiftBadge, SplitShiftSegmentList } from "../components/SplitShift";
import {
  getMySchedule,
  getOrgSchedule,
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import { getAvatarTone, type AvatarTone } from "@dubgrid/design-tokens";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { hapticSelection } from "../../../shared/lib/haptics";
import {
  keepPreviousDataForMobileIdentity,
  mobileQueryKeys,
} from "../../../shared/lib/mobile-query-keys";
import { useMobileContentState } from "../../../shared/hooks/useMobileContentState";
import { useIsDarkMode, useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  MAX_FONT_SCALE,
  MAX_FONT_SCALE_FIXED,
  mobileBorderColorFromText,
  mobileMotion,
  mobileRadii,
  mobileSpacing,
  mobileText,
  type MobileColors,
  mobileSoftGradientStops,
} from "../../../shared/theme/tokens";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useModalHandoff } from "../../../shared/hooks/useModalHandoff";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import { useMobileShiftRequestsRealtime } from "../../shift-requests/hooks/useMobileShiftRequestsRealtime";
import {
  type MobileRequestActionFeedback,
  getMobileRequestActionFeedback,
  getMobileRequestActionKey,
  getMobileRequestActionSuccessToast,
} from "../../shift-requests/lib/request-action-feedback";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  buildAvailableOpenShiftFeed,
  buildMeShiftRequestSections,
  buildScheduleMonthDays,
  buildScheduleWeekDays,
  buildTeamScheduleFocusAreaTabs,
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  filterScheduleEntriesByDate,
  filterTeamScheduleEntriesByFocusArea,
  formatCompactScheduleDate,
  formatScheduleDayLabel,
  formatScheduleRange,
  formatScheduleTimeRange,
  getCompactScheduleDateParts,
  getFeaturedMeScheduleSegment,
  getIsoDateInTimeZone,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryCustomStartTime,
  getScheduleEntryCustomTimeRange,
  getScheduleEntryEndTime,
  getScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegments,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
  getScheduleMonthStartDate,
  getScheduleMonthWeekIndexForDate,
  getScheduleRangeForDate,
  getSplitShiftSegmentLabel,
  getSplitShiftSegmentsForEntry,
  getSplitShiftSegmentsFromPresentation,
  isDeletedScheduleHistory,
  isGeneralScheduleEntrySegment,
  sortScheduleEntries,
  type AvailableShiftFeedItem,
  type FeaturedMeScheduleSegment,
  type MobileScheduleMonthDay,
  type MobileScheduleWeekDay,
  type WeeklyHoursSummary,
} from "../lib/schedule";
import {
  HERO_CARD_BACKGROUND_DARK,
  HERO_CARD_BACKGROUND_LIGHT,
  HERO_CARD_GRADIENT_DARK,
  HERO_CARD_GRADIENT_END,
  HERO_CARD_GRADIENT_LIGHT,
  HERO_CARD_GRADIENT_LOCATIONS,
  HERO_CARD_GRADIENT_START,
  HERO_CARD_SHADOW_DARK,
  HERO_CARD_SHADOW_LIGHT,
  HERO_COLLABORATOR_BACKGROUND_DARK,
  HERO_COLLABORATOR_BACKGROUND_LIGHT,
} from "../lib/heroCardTheme";
import {
  WEEK_SWIPE_FALLBACK_WIDTH,
  getCurrentTimeValue,
  getSegmentStartTime,
  getSegmentEndTime,
  getLocalDateTimeMinutes,
  getHeroTiming,
  formatHoursValue,
  getSwipeEventX,
  getSwipeEventTimestamp,
  clampWeekSwipeDelta,
  isCommittedWeekSwipe,
  type HeroTiming,
} from "../lib/scheduleScreenHelpers";
import {
  buildAbsenceChip,
  buildGeneralShiftChip,
  buildJobChip,
  getMeHeroShiftmates,
  getMeHeroSupplementalSplitSegments,
  getRequestDateLabel,
  getScheduleEntrySegmentChange,
  summariseScheduleSegment,
  type MobileScheduleSegmentChange,
  getScheduleItemFocusArea,
  getScheduleItemShiftName,
  getScheduleItemSplitShiftLabel,
  getScheduleItemTimeRange,
  getScheduleItemTypeChip,
  getSegmentJobChip,
  getVisibleScheduleItemTypeChip,
  hasMentoredSegments,
  isGeneralShiftSegment,
  shouldShowMePrimaryTitle,
  type JobChip,
} from "../lib/scheduleScreenChips";

import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import {
  DATE_HIGHLIGHT_SIZE,
  MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS,
  ME_HERO_AVATAR_FRAME_OVERLAP,
  MONTH_EXPAND_SECTION_GAP,
  MONTH_GRID_ROW_GAP,
  OPEN_SHIFT_CARD_MIN_HEIGHT,
  WEEK_STRIP_ROW_HEIGHT,
  createStyles,
} from "./scheduleScreenStyles";
import {
  getOpenShiftAbsenceTypeId,
  getOpenShiftFocusAreaName,
  getOpenShiftPrimarySegment,
  getOpenShiftTimeRange,
} from "../lib/openShiftPresentation";

/**
 * Shared by the two personal-scope sections that read the shift-requests query,
 * so a single failure raises a single toast rather than one from each.
 */
const SCHEDULE_REQUESTS_ERROR_TOAST_KEY = "schedule-requests-error";
const OPEN_SHIFT_STACK_PEEK_HEIGHT = 10;
const OPEN_SHIFT_STACK_SIDE_INSET = 6;
const UPCOMING_SHIFT_DIVIDER_DASHES = Array.from({ length: 18 });
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
type RequestActionBody =
  | { action: "claim"; claimerEmpId: string }
  | {
      action: "volunteer_open_shift";
      empId: string;
      shiftDate: string;
      focusAreaId: number;
      state: MobileOpenShift["state"];
    }
  | { action: "respond"; empId: string; accept: boolean };
type PendingRequestAction = {
  key: string;
} | null;
type RequestActionConfirmation = {
  requestId: string;
  body: RequestActionBody;
  feedback: MobileRequestActionFeedback;
} | null;

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

function getRequestSegments(request: MobileShiftRequest, which: "requester" | "target") {
  const legacyRequest = request as MobileShiftRequest & {
    requesterSegments?: MobileShiftRequest["requesterPresentation"]["segments"];
    targetSegments?: MobileShiftRequest["requesterPresentation"]["segments"] | null;
  };

  return which === "requester"
    ? (request.requesterPresentation?.segments ?? legacyRequest.requesterSegments ?? [])
    : (request.targetPresentation?.segments ?? legacyRequest.targetSegments ?? []);
}

function getRequestPrimarySegment(request: MobileShiftRequest, which: "requester" | "target") {
  return getRequestSegments(request, which)[0] ?? null;
}

function getRequestShiftName(request: MobileShiftRequest, which: "requester" | "target"): string {
  const segment = getRequestPrimarySegment(request, which);
  if (segment?.shiftName) {
    return segment.shiftName;
  }

  return which === "requester"
    ? (request.requesterPresentation?.label ?? "Shift")
    : (request.targetPresentation?.label ?? "Shift");
}

function getRequestAbsenceTypeId(
  request: MobileShiftRequest,
  which: "requester" | "target",
): number | null {
  const state = which === "requester" ? request.requesterState : request.targetState;
  if (state?.kind === "absence") {
    return state.absenceTypeId ?? null;
  }

  return which === "requester" ? (request.absenceTypeId ?? null) : null;
}

function getRequestJobName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  return getRequestSegments(request, which).find((segment) => segment.jobName)?.jobName ?? null;
}

function getRequestFocusAreaName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  if (getRequestAbsenceTypeId(request, which) != null) {
    return null;
  }

  return (
    getRequestSegments(request, which).find(
      (segment) => !isGeneralScheduleEntrySegment(segment) && segment.displayFocusAreaName,
    )?.displayFocusAreaName ?? null
  );
}

function getRequestTimeRange(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  const segments = getRequestSegments(request, which);
  const firstSegmentWithTime = segments.find((segment) => segment.startTime && segment.endTime);
  const lastSegmentWithTime =
    [...segments].reverse().find((segment) => segment.startTime && segment.endTime) ?? null;

  if (firstSegmentWithTime && lastSegmentWithTime) {
    return formatScheduleTimeRange(firstSegmentWithTime.startTime, lastSegmentWithTime.endTime);
  }

  if (which === "requester") {
    return formatScheduleTimeRange(
      request.requesterState?.customStartTime ?? null,
      request.requesterState?.customEndTime ?? null,
    );
  }

  return formatScheduleTimeRange(
    request.targetState?.customStartTime ?? null,
    request.targetState?.customEndTime ?? null,
  );
}

function getOpenShiftShiftName(openShift: MobileOpenShift): string {
  const primarySegment = getOpenShiftPrimarySegment(openShift);
  return primarySegment?.shiftName ?? openShift.presentation.label ?? "Open Shift";
}

function getOpenShiftJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  openShift: MobileOpenShift,
): JobChip | null {
  if (getOpenShiftAbsenceTypeId(openShift) != null) {
    return buildAbsenceChip(
      mobileColors,
      isDark,
      getOpenShiftShiftName(openShift),
      openShift.presentation,
    );
  }

  const primarySegment = getOpenShiftPrimarySegment(openShift);
  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getOpenShiftShiftName(openShift),
      primarySegment,
    );
  }

  const jobSegment = openShift.presentation.segments.find((segment) => segment.jobName);
  return buildJobChip(mobileColors, isDark, jobSegment?.jobName ?? null, jobSegment ?? null);
}

function formatOpenShiftCardCountLabel(count: number): string {
  return `${count} open shift card${count === 1 ? "" : "s"}`;
}

export function ScheduleScreen({ scope }: { scope: ScheduleScope }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const { pushToast } = useToast();
  const bootstrapQuery = useBootstrap(accessToken);
  const now = useRealtimeNow();
  // A dashboard coverage row opens the team schedule on its focus area. Read
  // as an effect rather than as the state's initial value: the tab screen stays
  // mounted between visits, so a second drill-in arrives as a param change.
  const params = useLocalSearchParams<{ focusAreaId?: string | string[] }>();
  const requestedFocusAreaId = Array.isArray(params.focusAreaId)
    ? params.focusAreaId[0]
    : params.focusAreaId;
  const [selectedTeamFocusAreaKey, setSelectedTeamFocusAreaKey] = useState<string | null>(null);
  useEffect(() => {
    if (scope === "team" && requestedFocusAreaId) {
      setSelectedTeamFocusAreaKey(`focus-area:${requestedFocusAreaId}`);
    }
  }, [requestedFocusAreaId, scope]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDateOverride, setSelectedDateOverride] = useState<string | null>(null);
  const [weekStripWidth, setWeekStripWidth] = useState(0);
  const [weekStripRowHeight, setWeekStripRowHeight] = useState(WEEK_STRIP_ROW_HEIGHT);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<string | null>(null);
  const calendarExpandProgress = useSharedValue(0);
  const calendarDragStartProgress = useSharedValue(0);
  const [pendingAction, setPendingAction] = useState<PendingRequestAction>(null);
  const [requestActionConfirmation, setRequestActionConfirmation] =
    useState<RequestActionConfirmation>(null);
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
  const canLoadSchedule = Boolean(accessToken) && (!isTeamScope || canViewTeamSchedule);
  const canLoadRequests = Boolean(accessToken) && !isTeamScope;
  const canLoadMeTeamSchedule = Boolean(accessToken) && !isTeamScope && canViewTeamSchedule;
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
  const requestActionMutation = useMutation({
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
    onError: (error) => {
      pushClientFriendlyErrorToast(pushToast, {
        error,
        title: "Could not update request",
        fallbackMessage: "We couldn't update that shift request right now.",
      });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        refetchScreenContent(),
        queryClient.invalidateQueries({
          queryKey: ["mobile", "requests"],
        }),
      ]);
      pushToast({
        tone: "success",
        ...getMobileRequestActionSuccessToast(variables.body),
      });
    },
  });
  const runRequestAction = useCallback(
    (requestId: string, body: RequestActionBody) => {
      if (requestActionMutation.isPending || pendingAction) {
        return;
      }

      const feedback = getMobileRequestActionFeedback({ requestId, body });
      setRequestActionConfirmation({ requestId, body, feedback });
    },
    [pendingAction, requestActionMutation.isPending],
  );

  const confirmRequestAction = useCallback(() => {
    if (!requestActionConfirmation) return;

    const { requestId, body, feedback } = requestActionConfirmation;
    setRequestActionConfirmation(null);
    setPendingAction({ key: feedback.key });
    // Returned so `ConfirmationModal` can latch on it. The guard above reads
    // state that a same-tick second tap has not seen cleared yet, so without
    // the promise a double-tap approves the request twice. Settling resolves
    // rather than rejects: the mutation's own `onError` already toasts.
    return new Promise<void>((resolve) => {
      requestActionMutation.mutate(
        { requestId, body },
        {
          onSettled: () => {
            setPendingAction(null);
            resolve();
          },
        },
      );
    });
  }, [requestActionConfirmation, requestActionMutation]);

  const activeData = scheduleQuery.data;
  const scheduleEntries = activeData?.entries ?? [];
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const canManageEmployees = Boolean(bootstrapQuery.data?.permissions.canManageEmployees);
  const unreadNotificationCount = bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const selectedDateLabel = formatScheduleDayLabel(selectedDate, now, timeZone);
  const teamHeaderDateLabel = formatTeamScheduleHeaderDateLabel(selectedDate, now, timeZone);
  const isSelectedToday = selectedDate === todayDate;
  const weekRangeLabel = formatScheduleRange(range, timeZone);
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
    <View style={styles.meWeekNavigator}>
      <View style={styles.meWeekNavigatorCopy}>
        <Text numberOfLines={1} style={styles.meWeekNavigatorTitle}>
          {selectedDateLabel}
        </Text>
        <Text numberOfLines={1} style={styles.meWeekNavigatorRangeLabel}>
          {weekRangeLabel}
        </Text>
      </View>
      <View style={styles.meWeekNavigatorActions}>
        <View style={styles.meWeekRangeControlGroup}>
          <IconControlButton
            accessibilityLabel="Previous week"
            iconName="chevron-back"
            onPress={handlePreviousWeek}
          />
          <IconControlButton
            accessibilityLabel="Next week"
            iconName="chevron-forward"
            onPress={handleNextWeek}
          />
        </View>
        {!isSelectedToday ? (
          <Pressable
            accessibilityRole="button"
            android_ripple={{ color: "rgba(37, 99, 235, 0.12)" }}
            onPress={handleGoToToday}
            style={({ pressed }) => [styles.meTodayButton, pressed && styles.meTodayButtonPressed]}
          >
            <Text style={styles.meTodayButtonText}>Today</Text>
          </Pressable>
        ) : null}
        <AlertsChromeButton unreadCount={unreadNotificationCount} />
      </View>
    </View>
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
          <Text numberOfLines={1} style={styles.teamHeaderTitle}>
            {teamHeaderDateLabel}
          </Text>
        </View>
        <View style={styles.teamHeaderActions}>
          {!isSelectedToday ? (
            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: "rgba(37, 99, 235, 0.12)" }}
              onPress={handleGoToToday}
              style={({ pressed }) => [
                styles.meTodayButton,
                pressed && styles.meTodayButtonPressed,
              ]}
            >
              <Text style={styles.meTodayButtonText}>Today</Text>
            </Pressable>
          ) : null}
          <AlertsChromeButton unreadCount={unreadNotificationCount} />
        </View>
      </View>

      <View style={styles.calendarBlock}>
        {/* Weekday labels: always visible, fixed in place — never move. */}
        <View style={styles.monthCalendarWeekdays}>
          {MONTH_WEEKDAY_LABELS.map((label) => (
            <Text key={label} style={styles.monthCalendarWeekdayLabel}>
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

  const homeWash = isTeamScope ? undefined : (
    <PageWash colors={mobileSoftGradientStops("aurora", isDark)} height={viewportHeight} />
  );

  return (
    <Screen
      bottomPaddingMode="tabbed"
      // The staff home sits on the brand aurora, the login page's wash, and
      // keeps it whatever the schedule says; the team schedule stays plain.
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
            accessibilityLabel="Focus areas"
            activeKey={activeTeamFocusAreaKey}
            onSelect={handleSelectFocusArea}
            tabs={teamFocusAreaTabs}
          />
        ) : null}
        {contentState.kind === "loading" ? (
          contentState.showSkeleton ? (
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
            title="Could not load schedule"
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
                  {index > 0 ? <View style={styles.shiftGroupDivider} /> : null}
                  <View style={styles.shiftGroupHeader}>
                    <Text style={styles.shiftGroupTitle}>{group.title}</Text>
                    {groupTimeRange ? (
                      <Text style={styles.shiftGroupTime}>{groupTimeRange}</Text>
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
        <ConfirmationModal
          body={requestActionConfirmation?.feedback.message}
          confirmLabel={requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"}
          confirmTone={
            requestActionConfirmation?.feedback.confirmStyle === "destructive"
              ? "danger"
              : "primary"
          }
          onCancel={() => setRequestActionConfirmation(null)}
          onConfirm={confirmRequestAction}
          title={requestActionConfirmation?.feedback.title ?? "Confirm action?"}
          visible={Boolean(requestActionConfirmation)}
        />
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
          maxFontSizeMultiplier={MAX_FONT_SCALE_FIXED}
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

function IconControlButton({
  accessibilityLabel,
  iconName,
  iconSize = 20,
  onPress,
}: {
  accessibilityLabel: string;
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  iconSize?: number;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconControlButton,
        pressed && styles.iconControlButtonPressed,
      ]}
    >
      <Ionicons color={mobileColors.textPrimary} name={iconName} size={iconSize} />
    </Pressable>
  );
}

function AlertsChromeButton({ unreadCount }: { unreadCount: number }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <Pressable
      accessibilityLabel="Open alerts"
      accessibilityRole="button"
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: true }}
      hitSlop={10}
      onPress={() => router.push("/alerts")}
      style={({ pressed }) => [
        styles.iconControlButton,
        pressed && styles.iconControlButtonPressed,
      ]}
    >
      <Ionicons color={mobileColors.textPrimary} name="notifications-outline" size={20} />
      <NumericBadge
        count={unreadCount}
        label={`${unreadCount} unread alerts`}
        max={9}
        size="sm"
        style={styles.alertBadge}
        tone="danger"
      />
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

function getRequestJobChip(
  mobileColors: MobileColors,
  isDark: boolean,
  request: MobileShiftRequest,
  which: "requester" | "target",
): JobChip | null {
  if (getRequestAbsenceTypeId(request, which) != null) {
    const presentation =
      which === "requester" ? request.requesterPresentation : request.targetPresentation;
    return buildAbsenceChip(
      mobileColors,
      isDark,
      getRequestShiftName(request, which),
      presentation,
    );
  }

  const primarySegment = getRequestPrimarySegment(request, which);

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      mobileColors,
      isDark,
      getRequestShiftName(request, which),
      primarySegment,
    );
  }

  const segment = getRequestSegments(request, which).find((item) => item.jobName) ?? null;
  const jobName = getRequestJobName(request, which);
  return buildJobChip(mobileColors, isDark, jobName, segment);
}

function MentoredPill() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text style={styles.mentoredPillText}>Mentored</Text>
    </View>
  );
}

function MeSectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View style={styles.meSectionHeader}>
      <View style={styles.meSectionHeaderCopy}>
        <Text style={styles.meSectionTitle}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.meSectionLink}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function JobPill({
  chip,
  compact,
  eyebrowDisplay = "inside",
  isMentored = chip?.isMentored === true,
}: {
  chip: JobChip | null;
  compact?: boolean;
  eyebrowDisplay?: "inside" | "outside";
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${isMentored ? " mentored assignment" : ""}`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const showsLabeledValue = chip.eyebrowLabel != null;
  const shouldRenderEyebrowInsidePill = eyebrowDisplay === "inside" && chip.eyebrowLabel;
  const shouldRenderSingleLinePill = !showsLabeledValue || eyebrowDisplay === "outside";
  const pillBorderColor =
    chip.kind === "general" ? mobileBorderColorFromText(chip.textColor) : chip.borderColor;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.jobPill,
        compact && styles.jobPillCompact,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: pillBorderColor,
        },
      ]}
    >
      {shouldRenderSingleLinePill ? (
        <View style={styles.jobPillInlineTextRow}>
          <Text
            style={[
              styles.jobPillText,
              compact && styles.jobPillTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
          </Text>
          {isMentored ? (
            <Text
              style={[
                styles.jobPillMentoredInlineText,
                compact && styles.jobPillMentoredInlineTextCompact,
                { color: chip.textColor },
              ]}
            >
              (Mentored)
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.jobPillTextStack}>
          {shouldRenderEyebrowInsidePill ? (
            <Text
              style={[
                styles.jobPillEyebrowText,
                compact && styles.jobPillEyebrowTextCompact,
                { color: chip.textColor },
              ]}
            >
              {chip.eyebrowLabel}
            </Text>
          ) : null}
          <Text
            style={[
              styles.jobPillValueText,
              compact && styles.jobPillValueTextCompact,
              { color: chip.textColor },
            ]}
          >
            {chip.label}
            {isMentored ? (
              <Text style={[styles.jobPillMentoredText, { color: chip.textColor }]}>
                {" "}
                (Mentored)
              </Text>
            ) : null}
          </Text>
        </View>
      )}
    </View>
  );
}

function MeTypePill({
  chip,
  compact,
  inverseLabel,
  titleScale = "row",
  isMentored = chip?.isMentored === true,
}: {
  chip: JobChip | null;
  compact?: boolean;
  inverseLabel?: boolean;
  titleScale?: "hero" | "row";
  isMentored?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  if (!chip.eyebrowLabel) {
    return <JobPill chip={chip} compact={compact} isMentored={isMentored} />;
  }

  return (
    <View style={styles.meTypePillStack}>
      <Text
        style={[
          styles.meTypePillLabel,
          titleScale === "hero" ? styles.meTypePillLabelHero : styles.meTypePillLabelRow,
          inverseLabel && styles.meTypePillLabelInverse,
        ]}
      >
        {chip.eyebrowLabel}
      </Text>
      <JobPill chip={chip} compact={compact} eyebrowDisplay="outside" isMentored={isMentored} />
    </View>
  );
}

type PreviousShiftSummary = { prefix: "Was" | "Removed"; text: string };

function getPreviousShiftSummary(
  change: MobileScheduleSegmentChange | null | undefined,
): PreviousShiftSummary | null {
  // A first publication has no earlier published state. Keep the underlying
  // change type for reconciliation, but never imply history in the UI.
  if (change?.kind === "new") {
    return null;
  }
  const previous = change?.previousPresentation;
  if (!previous) {
    return null;
  }

  if (change.kind === "deleted" && previous.segments.length > 1) {
    return { prefix: "Was", text: previous.segments.map(summariseScheduleSegment).join("; ") };
  }

  // A `modified` cell read for one segment names the published segment that
  // segment continues; a survivor with no counterpart of its own names what
  // its removed sibling was instead.
  if (change.previousSegment) {
    return { prefix: "Was", text: summariseScheduleSegment(change.previousSegment) };
  }
  if (change.removedSegments?.length) {
    return {
      prefix: "Removed",
      text: change.removedSegments.map(summariseScheduleSegment).join("; "),
    };
  }

  const title = previous.shiftName?.trim() || previous.label?.trim() || null;
  const timeRange = formatScheduleTimeRange(previous.startTime, previous.endTime);
  const focusAreaName = previous.displayFocusAreaName?.trim() || null;
  const parts = [title, timeRange, focusAreaName].filter((part): part is string =>
    Boolean(part && part.trim()),
  );

  return parts.length > 0 ? { prefix: "Was", text: parts.join(" · ") } : null;
}

function PreviousShiftRow({
  change,
  inverse = false,
}: {
  change: MobileScheduleSegmentChange | null | undefined;
  inverse?: boolean;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const summary = getPreviousShiftSummary(change);

  if (!summary) {
    return null;
  }

  return (
    <View accessibilityLabel={`Previous shift: ${summary.text}`} style={styles.previousShiftRow}>
      <Ionicons
        color={inverse ? "rgba(255, 255, 255, 0.74)" : mobileColors.textSubtle}
        name="arrow-undo-outline"
        size={14}
      />
      <Text style={[styles.previousShiftText, inverse && styles.previousShiftTextInverse]}>
        {summary.prefix} {summary.text}
      </Text>
    </View>
  );
}

function MeHeroShiftmates({ entries }: { entries: MobileScheduleEntry[] }) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (entries.length === 0) {
    return null;
  }

  const visibleEntries = entries.slice(0, 3);
  const overflowCount = entries.length - visibleEntries.length;
  const collaboratorBackground = {
    backgroundColor: isDark
      ? HERO_COLLABORATOR_BACKGROUND_DARK
      : HERO_COLLABORATOR_BACKGROUND_LIGHT,
  };

  return (
    <View style={[styles.meHeroCollaborators, collaboratorBackground]}>
      <View style={styles.meHeroCollaboratorLabelRow}>
        <Ionicons color="rgba(255, 255, 255, 0.76)" name="people-outline" size={22} />
        <Text style={styles.meHeroCollaboratorLabel}>Working with</Text>
      </View>
      <View style={styles.meHeroAvatarStack}>
        {visibleEntries.map((entry, index) => {
          const avatarTone = getAvatarTone(entry.employeeId, isDark);

          return (
            <View
              key={`${entry.employeeId}-${entry.date}`}
              style={[
                styles.meHeroCollaboratorAvatarFrame,
                collaboratorBackground,
                index > 0 && styles.meHeroCollaboratorAvatarFrameOverlap,
              ]}
            >
              <View
                style={[
                  styles.meHeroCollaboratorAvatar,
                  {
                    backgroundColor: avatarTone.backgroundColor,
                    borderColor: avatarTone.borderColor,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.meHeroCollaboratorAvatarText, { color: avatarTone.textColor }]}
                >
                  {getInitials(entry.employeeName)}
                </Text>
              </View>
            </View>
          );
        })}
        {overflowCount > 0 ? (
          <View
            style={[
              styles.meHeroCollaboratorAvatarFrame,
              collaboratorBackground,
              visibleEntries.length > 0 && styles.meHeroCollaboratorAvatarFrameOverlap,
            ]}
          >
            <View style={styles.meHeroCollaboratorOverflow}>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={styles.meHeroCollaboratorOverflowText}
              >
                +{overflowCount}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function MeHeroCard({
  currentDate,
  currentTime,
  featuredItem,
  status,
  timing,
  shiftmates,
  onPress,
}: {
  currentDate: string;
  currentTime: string;
  featuredItem: FeaturedMeScheduleSegment["item"];
  status: FeaturedMeScheduleSegment["status"];
  timing: HeroTiming | null;
  shiftmates: MobileScheduleEntry[];
  onPress?: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (!featuredItem) {
    return (
      <View style={styles.meSectionBlock} testID="me-empty-schedule-state">
        <EmptyStateCard
          iconName="calendar-outline"
          title="Nothing scheduled this week"
          body="Your upcoming shifts will appear here once published."
        />
      </View>
    );
  }

  const badgeLabel =
    status === "active"
      ? "On Duty"
      : status === "away"
        ? "Away"
        : status === "upcoming"
          ? "Upcoming"
          : "Scheduled";
  const heroDateLabel = formatCompactScheduleDate(featuredItem.date);
  const heroDateParts = getCompactScheduleDateParts(featuredItem.date);
  const shiftName = getScheduleItemShiftName(featuredItem);
  const change = getScheduleEntrySegmentChange(featuredItem.entry, featuredItem.segment);
  const typeChip = getVisibleScheduleItemTypeChip(mobileColors, isDark, featuredItem);
  const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, typeChip);
  const timeRange = getScheduleItemTimeRange(featuredItem);
  const splitSegments = featuredItem ? getSplitShiftSegmentsForEntry(featuredItem.entry) : [];
  const splitShiftCount = splitSegments.length;
  const focusAreaName = getScheduleItemFocusArea(featuredItem);
  const heroSplitSegments = getMeHeroSupplementalSplitSegments(
    featuredItem,
    splitSegments,
    currentDate,
    currentTime,
  );
  const heroSplitShiftLabel = getScheduleItemSplitShiftLabel(featuredItem);
  const shouldShowHeroSplitBadge = splitShiftCount > 1 && heroSplitSegments.segments.length > 0;
  const heroSplitChangeLabel = splitShiftCount > 1 ? getShiftChangeLabel(change) : null;
  const heroChange = splitShiftCount > 1 ? null : change;
  const heroChangeLabel = getShiftChangeLabel(heroChange);
  const badgeDotStyle =
    status === "active"
      ? styles.meHeroBadgeDotActive
      : status === "away" || status === "empty"
        ? styles.meHeroBadgeDotMuted
        : styles.meHeroBadgeDotScheduled;

  const cardContent = (
    <View style={styles.meHeroContent}>
      {badgeLabel || heroDateParts || shouldShowShiftName || shouldShowHeroSplitBadge ? (
        <View style={styles.meHeroHeader}>
          <View style={styles.meHeroHeaderCopy}>
            {badgeLabel ? (
              <View style={styles.meHeroBadgeRow}>
                <View style={styles.meHeroBadge}>
                  <View style={[styles.meHeroBadgeDot, badgeDotStyle]} />
                  <Text style={styles.meHeroBadgeText}>{badgeLabel}</Text>
                </View>
              </View>
            ) : null}
            {shouldShowShiftName || shouldShowHeroSplitBadge || heroChangeLabel ? (
              <View style={styles.meHeroTitleRow}>
                {shouldShowShiftName ? <Text style={styles.meHeroTitle}>{shiftName}</Text> : null}
                {heroChangeLabel ? (
                  <View style={styles.meHeroTitleBadgeSlot}>
                    <ShiftChangeBadge change={heroChange} inverse />
                  </View>
                ) : null}
                {shouldShowHeroSplitBadge ? (
                  <View style={styles.meHeroTitleBadgeSlot}>
                    <SplitShiftBadge
                      count={splitShiftCount}
                      inverse
                      label={
                        heroSplitChangeLabel
                          ? `${heroSplitShiftLabel ?? "Shift"} · ${heroSplitChangeLabel}`
                          : heroSplitShiftLabel
                      }
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
            {typeChip ? (
              <View style={styles.meHeroRoleRow}>
                <MeTypePill
                  chip={typeChip}
                  compact
                  inverseLabel
                  isMentored={featuredItem.segment.isMentored === true}
                  titleScale="hero"
                />
              </View>
            ) : featuredItem.segment.isMentored ? (
              <MentoredPill />
            ) : null}
          </View>
          {heroDateParts ? (
            <View accessibilityLabel={heroDateLabel ?? undefined} style={styles.meHeroDateTile}>
              <Text style={styles.meHeroDateWeekday}>{heroDateParts.weekdayLabel}</Text>
              <Text style={styles.meHeroDateDay}>{heroDateParts.dayLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {focusAreaName || timeRange || timing?.progress != null ? (
        <View style={styles.meHeroContextGroup}>
          {focusAreaName ? (
            <View style={styles.meHeroAreaRow}>
              <Ionicons color="rgba(255, 255, 255, 0.82)" name="location-outline" size={18} />
              <Text style={styles.meHeroAreaLabel}>{focusAreaName}</Text>
            </View>
          ) : null}
          {timeRange ? (
            <View style={styles.meHeroScheduleRow}>
              <View style={styles.meHeroTimeRow}>
                <Ionicons color="rgba(255, 255, 255, 0.82)" name="time-outline" size={24} />
                <Text style={styles.meHeroTimeText}>{timeRange}</Text>
              </View>
              {timing ? <Text style={styles.meHeroProgressLabel}>{timing.label}</Text> : null}
            </View>
          ) : null}
          {timing?.progress != null ? (
            <View style={styles.meHeroProgressTrack}>
              <View
                style={[
                  styles.meHeroProgressFill,
                  { width: `${Math.max(timing.progress, 0.08) * 100}%` },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      <MeHeroShiftmates entries={shiftmates} />
      {heroSplitSegments.segments.length > 0 ? (
        <SplitShiftSegmentList
          dashedDividers
          inverse
          leadingDivider
          renderSegmentChip={(segment) => (
            <JobPill
              chip={getSegmentJobChip(mobileColors, isDark, segment)}
              compact
              eyebrowDisplay="outside"
              isMentored={segment.isMentored === true}
            />
          )}
          getSegmentTimingLabel={(segment) =>
            getHeroTiming(
              featuredItem.entry,
              getSegmentStartTime(segment),
              getSegmentEndTime(segment),
              "scheduled",
              currentDate,
              currentTime,
            )?.label ?? null
          }
          getSegmentStatusLabel={(segment) =>
            getShiftChangeLabel(getScheduleEntrySegmentChange(featuredItem.entry, segment))
          }
          segmentLabelIndices={heroSplitSegments.segmentLabelIndices}
          segmentLabelTotalCount={splitShiftCount}
          segments={heroSplitSegments.segments}
          showWhenSingle
          suppressCountAccessibilityLabel
          variant="hero"
        />
      ) : null}
    </View>
  );

  const heroGradient = (
    <LinearGradient
      colors={isDark ? HERO_CARD_GRADIENT_DARK : HERO_CARD_GRADIENT_LIGHT}
      locations={HERO_CARD_GRADIENT_LOCATIONS}
      start={HERO_CARD_GRADIENT_START}
      end={HERO_CARD_GRADIENT_END}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    />
  );
  const heroCardThemeStyle = {
    backgroundColor: isDark ? HERO_CARD_BACKGROUND_DARK : HERO_CARD_BACKGROUND_LIGHT,
    shadowColor: isDark ? HERO_CARD_SHADOW_DARK : HERO_CARD_SHADOW_LIGHT,
  };

  return (
    <View style={styles.meSectionBlock}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.meHeroCard,
            heroCardThemeStyle,
            pressed && styles.meHeroCardPressed,
          ]}
          testID="me-hero-card"
        >
          <View style={styles.meHeroCardClip}>
            {heroGradient}
            {cardContent}
          </View>
        </Pressable>
      ) : (
        <View style={[styles.meHeroCard, heroCardThemeStyle]} testID="me-hero-card">
          <View style={styles.meHeroCardClip}>
            {heroGradient}
            {cardContent}
          </View>
        </View>
      )}
    </View>
  );
}

function UpcomingShiftsSection({
  items,
  onPressEntry,
  summary,
  todayDate,
  weekDays,
}: {
  items: Array<NonNullable<FeaturedMeScheduleSegment["item"]>>;
  onPressEntry: (entry: MobileScheduleEntry) => void;
  summary: WeeklyHoursSummary | null;
  todayDate: string;
  weekDays: MobileScheduleWeekDay[];
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  if (weekDays.length === 0) {
    return null;
  }

  const hoursLabel =
    summary && summary.scheduledHours > 0
      ? `${formatHoursValue(summary.scheduledHours)}h this week`
      : null;
  const itemsByDate = new Map<string, Array<NonNullable<FeaturedMeScheduleSegment["item"]>>>();
  const deletedEntriesByDate = new Map<string, MobileScheduleEntry[]>();
  items.forEach((item) => {
    const isDeleted = getScheduleEntrySegmentChange(item.entry, item.segment)?.kind === "deleted";
    if (isDeleted) {
      const deletedEntries = deletedEntriesByDate.get(item.date) ?? [];
      if (!deletedEntries.includes(item.entry)) {
        deletedEntries.push(item.entry);
        deletedEntriesByDate.set(item.date, deletedEntries);
      }
      return;
    }

    const dateItems = itemsByDate.get(item.date) ?? [];
    dateItems.push(item);
    itemsByDate.set(item.date, dateItems);
  });
  const groupedItems = weekDays.map((day) => ({
    date: day.date,
    items: itemsByDate.get(day.date) ?? [],
    deletedEntries: deletedEntriesByDate.get(day.date) ?? [],
  }));

  return (
    <View style={styles.upcomingSectionBlock}>
      <View style={styles.upcomingSectionHeader}>
        <Text style={styles.upcomingSectionTitle}>Your Week</Text>
        {hoursLabel ? (
          <View style={styles.upcomingHoursBadge}>
            <Text style={styles.upcomingHoursBadgeText}>{hoursLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.upcomingShiftsCard}>
        {groupedItems.map((group, groupIndex) => {
          const dateParts = getCompactScheduleDateParts(group.date);
          const isToday = group.date === todayDate;
          return (
            <View
              key={group.date}
              style={[
                styles.upcomingDateGroup,
                groupIndex > 0 && styles.upcomingShiftRowBorder,
                isToday && styles.upcomingShiftRowToday,
                isToday && groupIndex === 0 && styles.upcomingShiftRowTodayFirst,
                isToday &&
                  groupIndex === groupedItems.length - 1 &&
                  styles.upcomingShiftRowTodayLast,
              ]}
              testID={isToday ? `upcoming-today-row-${group.date}` : undefined}
            >
              <View style={styles.upcomingDateColumn}>
                <View style={styles.upcomingDateTile}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.upcomingDateWeekday}>
                    {dateParts.weekdayLabel}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.upcomingDateDay}>
                    {dateParts.dayLabel}
                  </Text>
                  {isToday ? (
                    <View
                      pointerEvents="none"
                      style={styles.upcomingDateTodayDot}
                      testID={`upcoming-today-date-dot-${group.date}`}
                    />
                  ) : null}
                </View>
              </View>

              <View style={styles.upcomingDateShiftStack}>
                {group.items.length === 0 ? (
                  <View
                    accessibilityLabel={`Unscheduled ${formatCompactScheduleDate(group.date)}`}
                    style={styles.upcomingUnscheduledRow}
                    testID={`upcoming-unscheduled-row-${group.date}`}
                  >
                    <Text
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={styles.upcomingUnscheduledTitle}
                    >
                      Unscheduled
                    </Text>
                    {group.deletedEntries.map((entry) => (
                      <PreviousShiftRow
                        key={`${entry.employeeId}:${entry.date}`}
                        change={entry.change}
                      />
                    ))}
                  </View>
                ) : (
                  <>
                    {group.items.map((item, itemIndex) => {
                      const typeChip = getScheduleItemTypeChip(mobileColors, isDark, item);
                      const change = getScheduleEntrySegmentChange(item.entry, item.segment);
                      const shiftName = getScheduleItemShiftName(item);
                      const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, typeChip);
                      const focusAreaName = getScheduleItemFocusArea(item);
                      const timeRange = getScheduleItemTimeRange(item);
                      const splitSegments = getSplitShiftSegmentsForEntry(item.entry);
                      const splitShiftLabel = getScheduleItemSplitShiftLabel(item);
                      const splitChangeLabel =
                        splitSegments.length > 1 ? getShiftChangeLabel(change) : null;

                      return (
                        <Fragment key={item.key}>
                          {itemIndex > 0 ? <UpcomingShiftDashedDivider /> : null}
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => onPressEntry(item.entry)}
                            style={styles.upcomingShiftRow}
                          >
                            <View style={styles.upcomingShiftCopy}>
                              {/* Title and time stack rather than sitting in two
                              columns. Side by side, the time never gave width
                              back, so at a raised OS text size the name was
                              squeezed into a column narrow enough to break
                              mid-word ("Visitin / g Nursin / g"). */}
                              {shouldShowShiftName || splitSegments.length > 1 || timeRange ? (
                                <View style={styles.upcomingShiftHeading}>
                                  {shouldShowShiftName || splitSegments.length > 1 || change ? (
                                    <View style={styles.upcomingShiftTitleMeta}>
                                      {shouldShowShiftName ? (
                                        <Text
                                          maxFontSizeMultiplier={MAX_FONT_SCALE}
                                          style={styles.upcomingShiftTitle}
                                        >
                                          {shiftName}
                                        </Text>
                                      ) : null}
                                      {splitSegments.length > 1 ? (
                                        <SplitShiftBadge
                                          count={splitSegments.length}
                                          compact
                                          label={
                                            splitChangeLabel
                                              ? `${splitShiftLabel ?? "Shift"} · ${splitChangeLabel}`
                                              : splitShiftLabel
                                          }
                                        />
                                      ) : null}
                                      <ShiftChangeBadge
                                        change={splitSegments.length > 1 ? null : change}
                                      />
                                    </View>
                                  ) : null}
                                </View>
                              ) : null}
                              <MeTypePill
                                chip={typeChip}
                                compact
                                isMentored={item.segment.isMentored === true}
                              />
                              {focusAreaName ? (
                                <Text
                                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                                  style={styles.upcomingShiftArea}
                                >
                                  {focusAreaName}
                                </Text>
                              ) : null}
                              {timeRange ? (
                                <View style={styles.upcomingShiftTime}>
                                  <Text
                                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                                    style={styles.upcomingShiftTimeText}
                                  >
                                    {timeRange}
                                  </Text>
                                </View>
                              ) : null}
                              <PreviousShiftRow change={change} />
                            </View>
                          </Pressable>
                        </Fragment>
                      );
                    })}
                    {group.deletedEntries.map((entry) => (
                      <Fragment key={`${entry.employeeId}:${entry.date}`}>
                        <UpcomingShiftDashedDivider />
                        <View style={styles.upcomingDeletedHistoryRow}>
                          <PreviousShiftRow change={entry.change} />
                        </View>
                      </Fragment>
                    ))}
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function UpcomingShiftDashedDivider() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <View
      pointerEvents="none"
      style={styles.upcomingShiftDashedDivider}
      testID="upcoming-shift-dashed-divider"
    >
      {UPCOMING_SHIFT_DIVIDER_DASHES.map((_, index) => (
        <View key={index} style={styles.upcomingShiftDashedDividerSegment} />
      ))}
    </View>
  );
}

function OpenShiftsSection({
  requests,
  openShifts,
  scheduleEntries,
  linkedEmployeeId,
  pendingAction,
  now,
  requestsError,
  timeZone,
  openShiftVisibility,
  onClaim,
  onVolunteer,
  onSeeAll,
}: {
  requests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  scheduleEntries: MobileScheduleEntry[];
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  now: Date;
  requestsError: unknown;
  timeZone?: string | null;
  openShiftVisibility?: {
    coverageGap: "hidden" | "matched" | "always";
    calloff: "hidden" | "matched" | "always";
  };
  onClaim: (requestId: string) => void;
  onVolunteer: (openShift: MobileOpenShift) => void;
  onSeeAll: () => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { pushToast } = useToast();
  // The day whose full list is open in the sheet; the carousel itself never
  // grows, a stacked day is a deck the reader taps to open.
  const [openDate, setOpenDate] = useState<string | null>(null);
  const handoff = useModalHandoff();
  const [stackCardHeights, setStackCardHeights] = useState<Record<string, number>>({});
  useEffect(() => {
    if (requestsError) {
      pushClientFriendlyErrorToast(pushToast, {
        error: requestsError,
        title: "Could not load shift requests",
        fallbackMessage: "We couldn't load shift requests right now.",
        // This section and the cover-requests section below render together in
        // personal scope and read the same query, so one failure used to raise
        // two differently-titled toasts. One failure, one toast.
        dedupeKey: SCHEDULE_REQUESTS_ERROR_TOAST_KEY,
      });
    }
  }, [requestsError, pushToast]);
  const availableOpenShiftFeed = useMemo(
    () =>
      buildAvailableOpenShiftFeed({
        linkedEmployeeId,
        scheduleEntries,
        openShifts,
        requests,
        now,
        timeZone,
        coverageGapVisibility: openShiftVisibility?.coverageGap,
        calloffVisibility: openShiftVisibility?.calloff,
      }),
    [linkedEmployeeId, now, openShifts, requests, scheduleEntries, timeZone, openShiftVisibility],
  );
  const dateGroups = availableOpenShiftFeed.groups;
  const noteStackCardHeight = useCallback((date: string, height: number) => {
    setStackCardHeights((currentHeights) => {
      if (currentHeights[date] === height) {
        return currentHeights;
      }

      return {
        ...currentHeights,
        [date]: height,
      };
    });
  }, []);
  const openGroup =
    openDate != null ? (dateGroups.find((group) => group.date === openDate) ?? null) : null;
  const renderFeedCard = (
    item: AvailableShiftFeedItem,
    options?: {
      accessibilityLabel?: string;
      onToggle?: () => void;
      /**
       * Wraps Volunteer and Claim inside the day sheet: the sheet closes first
       * and the action runs once it has left. Its confirmation is a Modal of
       * its own, which UIKit refuses to present while the sheet is still
       * dismissing, and the toast that reports the result would be hidden
       * behind an open sheet anyway.
       */
      runAction?: (action: () => void) => void;
    },
  ) => {
    const runAction = options?.runAction ?? ((action: () => void) => action());
    const cardSurfaceProps =
      options?.onToggle != null
        ? {
            accessibilityLabel: options.accessibilityLabel,
            onPress: options.onToggle,
          }
        : null;

    if (item.kind === "open_shift") {
      const volunteerBody: RequestActionBody | null = linkedEmployeeId
        ? {
            action: "volunteer_open_shift",
            empId: linkedEmployeeId,
            shiftDate: item.openShift.date,
            focusAreaId: item.openShift.focusAreaId,
            state: item.openShift.state,
          }
        : null;
      const isVolunteerLoading =
        volunteerBody != null &&
        pendingAction?.key === getMobileRequestActionKey(item.openShift.id, volunteerBody);
      const jobChip = getOpenShiftJobChip(mobileColors, isDark, item.openShift);
      const isMentored = hasMentoredSegments(item.openShift.presentation.segments);
      const shiftName = getOpenShiftShiftName(item.openShift);
      const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
      const focusAreaName = getOpenShiftFocusAreaName(item.openShift);
      const timeRange = getOpenShiftTimeRange(item.openShift);
      const splitSegments = getSplitShiftSegmentsFromPresentation(
        item.openShift.presentation,
        item.openShift.state,
      );
      const hasSplitSegments = splitSegments.length > 1;
      const content = (
        <>
          {shouldShowShiftName || hasSplitSegments ? (
            <View style={styles.scheduleRowTitleWithBadge}>
              {shouldShowShiftName ? (
                <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
              ) : null}
              {hasSplitSegments ? <SplitShiftBadge count={splitSegments.length} compact /> : null}
            </View>
          ) : null}
          {hasSplitSegments ? (
            <View style={styles.openShiftSplitPanel}>
              <SplitShiftSegmentList
                renderSegmentChip={(segment) => (
                  <JobPill
                    chip={getSegmentJobChip(mobileColors, isDark, segment)}
                    compact
                    eyebrowDisplay="outside"
                    isMentored={segment.isMentored === true}
                  />
                )}
                segments={splitSegments}
                variant="compact"
              />
            </View>
          ) : jobChip || focusAreaName || isMentored ? (
            <View style={styles.scheduleRowContextStack}>
              {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
              {jobChip || isMentored ? (
                <View style={styles.scheduleRowContext}>
                  <MeTypePill chip={jobChip} compact isMentored={isMentored} />
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.scheduleRowMeta}>
            {item.openShift.needed} teammate
            {item.openShift.needed === 1 ? "" : "s"} needed
          </Text>
          {!hasSplitSegments && timeRange ? (
            <View style={styles.scheduleRowTime}>
              <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
              <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
            </View>
          ) : null}
        </>
      );
      const cardSurface = cardSurfaceProps ? (
        <Pressable
          accessibilityLabel={cardSurfaceProps.accessibilityLabel}
          onPress={cardSurfaceProps.onPress}
          style={styles.openShiftCardSurface}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.openShiftCardSurface}>{content}</View>
      );
      const volunteerBlockReason =
        item.openShift.canVolunteer === false
          ? (item.openShift.volunteerBlockReason ?? "You can't volunteer for this shift right now.")
          : null;

      return (
        <View key={item.key} style={styles.openShiftCard}>
          {cardSurface}
          {volunteerBlockReason ? (
            <Text style={styles.scheduleRowMeta}>{volunteerBlockReason}</Text>
          ) : null}
          <Button
            disabled={
              Boolean(pendingAction) || !linkedEmployeeId || item.openShift.canVolunteer === false
            }
            label="Volunteer"
            leadingAccessory={
              <Ionicons color={mobileColors.brand} name="add-circle-outline" size={18} />
            }
            loading={isVolunteerLoading}
            onPress={() => {
              if (item.openShift.canVolunteer === false) {
                return;
              }
              runAction(() => onVolunteer(item.openShift));
            }}
            tone="secondary"
          />
        </View>
      );
    }

    const claimBody: RequestActionBody | null = linkedEmployeeId
      ? {
          action: "claim",
          claimerEmpId: linkedEmployeeId,
        }
      : null;
    const isPendingVolunteerRequest =
      item.request.type === "pickup" &&
      item.request.status === "pending_approval" &&
      item.request.requesterEmpId === linkedEmployeeId &&
      item.request.targetEmpId == null &&
      item.request.parentRequestId == null;
    const isClaimLoading =
      claimBody != null &&
      pendingAction?.key === getMobileRequestActionKey(item.request.id, claimBody);
    const jobChip = getRequestJobChip(mobileColors, isDark, item.request, "requester");
    const isMentored = hasMentoredSegments(getRequestSegments(item.request, "requester"));
    const shiftName = getRequestShiftName(item.request, "requester");
    const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
    const focusAreaName = getRequestFocusAreaName(item.request, "requester");
    const timeRange = getRequestTimeRange(item.request, "requester");
    const cardSurface = cardSurfaceProps ? (
      <Pressable
        accessibilityLabel={cardSurfaceProps.accessibilityLabel}
        onPress={cardSurfaceProps.onPress}
        style={styles.openShiftCardSurface}
      >
        {shouldShowShiftName ? <Text style={styles.scheduleRowTitle}>{shiftName}</Text> : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </Pressable>
    ) : (
      <View style={styles.openShiftCardSurface}>
        {shouldShowShiftName ? <Text style={styles.scheduleRowTitle}>{shiftName}</Text> : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text> : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </View>
    );

    return (
      <View key={item.key} style={styles.openShiftCard}>
        {cardSurface}
        <Button
          disabled={isPendingVolunteerRequest || Boolean(pendingAction) || !linkedEmployeeId}
          label={isPendingVolunteerRequest ? "Pending approval" : "Claim Shift"}
          leadingAccessory={
            <Ionicons
              color={mobileColors.brand}
              name={isPendingVolunteerRequest ? "hourglass-outline" : "add-circle-outline"}
              size={18}
            />
          }
          loading={isClaimLoading}
          onPress={() => runAction(() => onClaim(item.request.id))}
          tone="secondary"
        />
      </View>
    );
  };

  if (requestsError || availableOpenShiftFeed.totalCount === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader actionLabel="See all" onAction={onSeeAll} title="Open Shifts" />

      <ScrollView
        accessibilityLabel="Open shifts carousel"
        horizontal
        style={styles.openShiftCarousel}
        contentContainerStyle={styles.openShiftCarouselContent}
        showsHorizontalScrollIndicator={false}
      >
        {dateGroups.map((group) => {
          const dateLabel = formatCompactScheduleDate(group.date);
          const deckItems = group.items.slice(0, MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS);
          const isStack = deckItems.length > 1;
          const hiddenStackCount = isStack ? deckItems.length - 1 : 0;
          const stackedDeckHeight = hiddenStackCount * OPEN_SHIFT_STACK_PEEK_HEIGHT;
          const stackCardHeight = stackCardHeights[group.date] ?? OPEN_SHIFT_CARD_MIN_HEIGHT;
          const openSheetLabel = `Show all open shifts for ${dateLabel}`;

          return (
            <View key={group.date} style={styles.openShiftDateCard}>
              <View style={styles.openShiftDateHeader}>
                <Text style={styles.scheduleRowDate}>{dateLabel}</Text>
                <NumericBadge
                  count={group.itemCount}
                  label={formatOpenShiftCardCountLabel(group.itemCount)}
                  tone="brand"
                />
              </View>
              <View
                style={[
                  styles.openShiftDateCardItems,
                  isStack && styles.openShiftDateCardItemsStacked,
                  isStack && {
                    minHeight: stackCardHeight,
                    paddingBottom: stackedDeckHeight,
                  },
                ]}
              >
                {isStack ? (
                  <>
                    {deckItems.slice(1).map((item, index) => {
                      const stackIndex = index + 1;
                      const top = stackIndex * OPEN_SHIFT_STACK_PEEK_HEIGHT;
                      const inset = stackIndex * OPEN_SHIFT_STACK_SIDE_INSET;

                      return (
                        <View
                          key={`${item.key}-stacked`}
                          pointerEvents="none"
                          style={[
                            styles.openShiftCard,
                            styles.openShiftCardStacked,
                            {
                              height: stackCardHeight,
                              left: inset,
                              right: inset,
                              top,
                              zIndex: deckItems.length - stackIndex,
                            },
                          ]}
                        />
                      );
                    })}
                    <View
                      onLayout={(event) => {
                        noteStackCardHeight(group.date, event.nativeEvent.layout.height);
                      }}
                      style={styles.openShiftCardLead}
                    >
                      {renderFeedCard(deckItems[0] as AvailableShiftFeedItem, {
                        accessibilityLabel: openSheetLabel,
                        onToggle: () => setOpenDate(group.date),
                      })}
                    </View>
                  </>
                ) : (
                  deckItems.map((item) => renderFeedCard(item))
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <BottomSheetModal
        accessibilityLabel="Dismiss open shifts"
        debugName="Open shifts for a day"
        header={
          openGroup ? (
            <SheetHeader
              subtitle={`${openGroup.itemCount} open shift${openGroup.itemCount === 1 ? "" : "s"}`}
              title={formatCompactScheduleDate(openGroup.date)}
            />
          ) : undefined
        }
        scrollable
        visible={openGroup != null}
        onDismiss={() => setOpenDate(null)}
      >
        <View style={styles.openShiftSheetList}>
          {openGroup?.items.map((item) =>
            renderFeedCard(item, {
              runAction: (action) => {
                setOpenDate(null);
                handoff(action);
              },
            }),
          )}
        </View>
      </BottomSheetModal>
    </View>
  );
}

function ShiftCoverRequestsSection({
  requests,
  linkedEmployeeId,
  pendingAction,
  requestsError,
  onRespond,
}: {
  requests: MobileShiftRequest[];
  linkedEmployeeId: string | null;
  pendingAction: PendingRequestAction;
  requestsError: unknown;
  onRespond: (requestId: string, accept: boolean) => void;
}) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  const { pushToast } = useToast();
  useEffect(() => {
    if (requestsError) {
      pushClientFriendlyErrorToast(pushToast, {
        error: requestsError,
        title: "Could not load shift requests",
        fallbackMessage: "We couldn't load shift requests right now.",
        dedupeKey: SCHEDULE_REQUESTS_ERROR_TOAST_KEY,
      });
    }
  }, [requestsError, pushToast]);

  if (requestsError || requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader title="Needs Your Response" />

      <View style={styles.requestList}>
        {requests.map((request) => {
          const avatarTone = getAvatarTone(request.requesterEmpId, isDark);
          const jobChip = getRequestJobChip(mobileColors, isDark, request, "requester");
          const shiftName = getRequestShiftName(request, "requester");
          const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, jobChip);
          const focusAreaName = getRequestFocusAreaName(request, "requester");
          const isMentored = hasMentoredSegments(getRequestSegments(request, "requester"));
          const timeRange = getRequestTimeRange(request, "requester");
          const acceptBody: RequestActionBody | null = linkedEmployeeId
            ? { action: "respond", empId: linkedEmployeeId, accept: true }
            : null;
          const declineBody: RequestActionBody | null = linkedEmployeeId
            ? { action: "respond", empId: linkedEmployeeId, accept: false }
            : null;
          const isAcceptLoading =
            acceptBody != null &&
            pendingAction?.key === getMobileRequestActionKey(request.id, acceptBody);
          const isDeclineLoading =
            declineBody != null &&
            pendingAction?.key === getMobileRequestActionKey(request.id, declineBody);

          return (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestHeaderRow}>
                <View style={styles.requestHeaderCopy}>
                  <View
                    style={[
                      styles.requestAvatar,
                      {
                        backgroundColor: avatarTone.backgroundColor,
                        borderColor: avatarTone.borderColor,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={MAX_FONT_SCALE}
                      style={[styles.requestAvatarText, { color: avatarTone.textColor }]}
                    >
                      {getInitials(request.requesterName)}
                    </Text>
                  </View>
                  <View style={styles.requestHeaderTextStack}>
                    <Text style={styles.requestHeaderText}>{request.requesterName}</Text>
                    <Text style={styles.requestHeaderSubtext}>Needs shift coverage</Text>
                  </View>
                </View>
                <Text style={styles.requestDateText}>{getRequestDateLabel(request)}</Text>
              </View>

              {shouldShowShiftName ? (
                <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
              ) : null}
              {jobChip || focusAreaName || isMentored ? (
                <View style={styles.scheduleRowContext}>
                  <MeTypePill chip={jobChip} compact isMentored={isMentored} />
                  {focusAreaName ? (
                    <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text>
                  ) : null}
                </View>
              ) : null}
              {timeRange ? (
                <View style={styles.scheduleRowTime}>
                  <Ionicons color={mobileColors.textMuted} name="time-outline" size={18} />
                  <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
                </View>
              ) : null}

              <ActionButtons
                primaryAction={
                  <Button
                    disabled={Boolean(pendingAction) || !linkedEmployeeId}
                    label="Accept"
                    loading={isAcceptLoading}
                    onPress={() => onRespond(request.id, true)}
                  />
                }
                style={styles.requestActions}
              >
                <Button
                  disabled={Boolean(pendingAction) || !linkedEmployeeId}
                  label="Decline"
                  loading={isDeclineLoading}
                  onPress={() => onRespond(request.id, false)}
                  tone="neutral"
                />
              </ActionButtons>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TeamShiftMemberRow({
  groupTimeRange,
  isFirst,
  linkedEmployeeId,
  row,
  onPress,
}: {
  groupTimeRange: string | null;
  isFirst: boolean;
  linkedEmployeeId: string | null;
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
  const isMentored = segment
    ? segment.isMentored === true
    : hasMentoredSegments(getScheduleEntrySegments(entry));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.teamMemberRow, !isFirst && styles.teamMemberRowBorder]}
    >
      <View
        style={[
          styles.teamMemberAvatar,
          {
            backgroundColor: avatarTone.backgroundColor,
            borderColor: avatarTone.borderColor,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.teamMemberAvatarText, { color: avatarTone.textColor }]}
        >
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.teamMemberMain}>
        <View style={styles.teamMemberCopy}>
          <View style={styles.teamMemberNameRow}>
            <Text style={styles.teamMemberName}>{memberName}</Text>
            <ShiftChangeBadge change={change} />
          </View>
          {memberTimeRange ? <Text style={styles.teamMemberTime}>{memberTimeRange}</Text> : null}
          <PreviousShiftRow change={change} />
          {alternateShiftLabel ? (
            <View style={styles.teamMemberSplitBadgeRow}>
              <SplitShiftBadge
                count={row.alternateShiftTitles.length + 1}
                compact
                label={alternateShiftLabel}
              />
            </View>
          ) : null}
        </View>
        {roleChip || isMentored ? (
          <View style={styles.teamMemberRoleRow}>
            <JobPill chip={roleChip} compact eyebrowDisplay="outside" isMentored={isMentored} />
          </View>
        ) : null}
      </View>
    </Pressable>
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

function getInitials(name: string): string {
  const parts = name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "") : "";

  return `${first}${last}` || "?";
}

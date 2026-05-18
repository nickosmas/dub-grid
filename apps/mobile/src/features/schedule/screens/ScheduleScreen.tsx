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
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
  type AppStateStatus,
  type GestureResponderEvent,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnchoredPopupSurface } from "../../../shared/components/AnchoredPopupSurface";
import { Button } from "../../../shared/components/Button";
import { ConfirmationModal } from "../../../shared/components/ConfirmationModal";
import { EmptyStateCard } from "../../../shared/components/EmptyStateCard";
import {
  HeroSkeleton,
  ListSkeleton,
} from "../../../shared/components/Skeleton";
import {
  Card,
  Screen,
  type ScreenScrollHandle,
} from "../../../shared/components/Screen";
import { StatusBanner } from "../../../shared/components/StatusBanner";
import {
  SplitShiftBadge,
  SplitShiftSegmentList,
} from "../components/SplitShift";
import {
  getMySchedule,
  getOrgSchedule,
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import { pushClientFriendlyErrorToast } from "../../../shared/lib/errors";
import { hapticSelection } from "../../../shared/lib/haptics";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import { useToast } from "../../../shared/providers/ToastProvider";
import {
  mobileColors,
  mobileBorderColorFromText,
  mobileRadii,
  mobileSpacing,
  mobileText,
} from "../../../shared/theme/tokens";
import { useManualRefresh } from "../../../shared/hooks/useManualRefresh";
import { useRealtimeNow } from "../../../shared/hooks/useRealtimeNow";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
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
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  buildTeamScheduleFocusAreaTabs,
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  filterScheduleEntriesByDate,
  filterTeamScheduleEntriesByFocusArea,
  formatCompactScheduleDate,
  formatScheduleDayLabel,
  formatScheduleMonthLabel,
  formatScheduleRange,
  formatScheduleTimeRange,
  getFeaturedMeScheduleSegment,
  getCompactScheduleDateParts,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCustomTimeRange,
  getScheduleEntryCustomStartTime,
  getScheduleEntryEndTime,
  getScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
  getScheduleMonthStartDate,
  getScheduleRangeForDate,
  getSplitShiftSegmentLabel,
  getSplitShiftSegmentsForEntry,
  getSplitShiftSegmentsFromPresentation,
  getIsoDateInTimeZone,
  sortScheduleEntries,
  type AvailableShiftFeedItem,
  type FeaturedMeScheduleSegment,
  type MobileScheduleMonthDay,
  type MobileScheduleWeekDay,
  type WeeklyHoursSummary,
} from "../lib/schedule";
import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";

const WEEK_SWIPE_FALLBACK_WIDTH = 360;
const WEEK_SWIPE_MIN_THRESHOLD = 96;
const WEEK_SWIPE_THRESHOLD_RATIO = 0.3;
const WEEK_SWIPE_FLICK_MIN_DISTANCE = 24;
const WEEK_SWIPE_FLICK_VELOCITY = 0.45;
const MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS = 4;
const OPEN_SHIFT_CARD_MIN_HEIGHT = 180;
const OPEN_SHIFT_CARD_SHADOW_ALLOWANCE = 18;
const ME_HERO_AVATAR_FRAME_OVERLAP = -10;
const OPEN_SHIFT_STACK_PEEK_HEIGHT = 10;
const OPEN_SHIFT_STACK_SIDE_INSET = 6;
const SCHEDULE_CALENDAR_POPUP_RIGHT_OFFSET = 52;
const UPCOMING_SHIFT_DIVIDER_DASHES = Array.from({ length: 18 });
const MONTH_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ME_HERO_CARD_BACKGROUND = "#2946C7";
const ME_HERO_COLLABORATOR_BACKGROUND = "#3A55CB";

if (
  Platform.OS === "android" &&
  typeof UIManager.setLayoutAnimationEnabledExperimental === "function"
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ScheduleScope = "mine" | "team";
type ShiftTimeRange = {
  start: string;
  end: string;
};
type AvatarTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};
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
  label: string;
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

function getFirstDateForFocusArea(
  entries: MobileScheduleEntry[],
  focusAreaKey: string,
): string | null {
  const matchingEntries = filterTeamScheduleEntriesByFocusArea(
    entries,
    focusAreaKey,
  );

  if (matchingEntries.length === 0) {
    return null;
  }

  return (
    [...matchingEntries].sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      const leftTime =
        getScheduleEntryStartTime(left) ??
        getScheduleEntryCustomStartTime(left) ??
        "99:99:99";
      const rightTime =
        getScheduleEntryStartTime(right) ??
        getScheduleEntryCustomStartTime(right) ??
        "99:99:99";
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }

      return left.employeeName.localeCompare(right.employeeName);
    })[0]?.date ?? null
  );
}

function formatScheduleHeaderDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
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
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));

  return `${weekdayLabel}, ${dateLabel}`;
}

function normalizeTeamShiftGroupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTeamShiftSegmentTitle(segment: MobileScheduleEntrySegment): string {
  const rawTitle =
    segment.shiftName?.trim() || segment.label?.trim() || "Shift";
  const jobName = segment.jobName?.trim();

  if (jobName && rawTitle.endsWith(` ${jobName}`)) {
    return rawTitle.slice(0, -jobName.length).trim();
  }

  return rawTitle;
}

function getTeamShiftSegmentGroupKey(
  segment: MobileScheduleEntrySegment,
  title: string,
): string {
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

function getTeamShiftSegmentTimeRange(
  segment: MobileScheduleEntrySegment | null,
): string | null {
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
  return customTimeRange && customTimeRange !== groupTimeRange
    ? customTimeRange
    : null;
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

function sortTeamScheduleShiftRows(
  rows: TeamScheduleShiftRow[],
): TeamScheduleShiftRow[] {
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
          (title, index, titles) =>
            title !== segmentGroup.title && titles.indexOf(title) === index,
        );
      const existingRow = group.rows.find((row) => row.entry === entry);

      if (existingRow) {
        existingRow.alternateShiftTitles = Array.from(
          new Set([
            ...existingRow.alternateShiftTitles,
            ...alternateShiftTitles,
          ]),
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

function getTimePartsInTimeZone(
  value: Date,
  timeZone?: string | null,
): { hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
    second: Number(parts.find((part) => part.type === "second")?.value ?? "0"),
  };
}

function getCurrentTimeValue(value: Date, timeZone?: string | null): string {
  const parts = getTimePartsInTimeZone(value, timeZone);

  return `${`${parts.hour}`.padStart(2, "0")}:${`${parts.minute}`.padStart(2, "0")}:${`${parts.second}`.padStart(2, "0")}`;
}

function getMinutesSinceMidnight(value: string): number | null {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function expandTimeRange(
  range: ShiftTimeRange,
): Array<{ start: number; end: number }> {
  const startMinutes = getMinutesSinceMidnight(range.start);
  const endMinutes = getMinutesSinceMidnight(range.end);

  if (startMinutes == null || endMinutes == null) {
    return [];
  }

  if (endMinutes <= startMinutes) {
    return [
      { start: startMinutes, end: 24 * 60 },
      { start: 0, end: endMinutes },
    ];
  }

  return [{ start: startMinutes, end: endMinutes }];
}

type HeroTiming = {
  label: string;
  progress: number | null;
};

function getSegmentStartTime(
  segment: MobileScheduleEntrySegment | null | undefined,
): string | null {
  return segment?.startTime ?? segment?.shiftStartTime ?? null;
}

function getSegmentEndTime(
  segment: MobileScheduleEntrySegment | null | undefined,
): string | null {
  return segment?.endTime ?? segment?.shiftEndTime ?? null;
}

function formatDurationValue(totalMinutes: number): string {
  const minutes = Math.max(totalMinutes, 0);
  const daysPart = Math.floor(minutes / (24 * 60));
  const remainingDayMinutes = minutes % (24 * 60);
  const hoursPart = Math.floor(remainingDayMinutes / 60);
  const minutesPart = remainingDayMinutes % 60;

  if (daysPart > 0) {
    return hoursPart > 0 ? `${daysPart}d ${hoursPart}h` : `${daysPart}d`;
  }

  if (hoursPart === 0) {
    return `${minutesPart}m`;
  }

  if (minutesPart === 0) {
    return `${hoursPart}h`;
  }

  return `${hoursPart}h ${minutesPart}m`;
}

function formatDurationLabel(totalMinutes: number): string {
  return `${formatDurationValue(totalMinutes)} left`;
}

function getIsoDateOrdinal(value: string): number | null {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor(timestamp / (24 * 60 * 60 * 1000));
}

function getLocalDateTimeMinutes(date: string, time: string): number | null {
  const dateOrdinal = getIsoDateOrdinal(date);
  const timeMinutes = getMinutesSinceMidnight(time);

  if (dateOrdinal == null || timeMinutes == null) {
    return null;
  }

  return dateOrdinal * 24 * 60 + timeMinutes;
}

function getStartingInLabel(input: {
  currentDate: string;
  currentTime: string;
  shiftDate: string;
  shiftStartTime: string | null;
}): string | null {
  if (!input.shiftStartTime) {
    return null;
  }

  const shiftStartMinutes = getLocalDateTimeMinutes(
    input.shiftDate,
    input.shiftStartTime,
  );
  const currentMinutes = getLocalDateTimeMinutes(
    input.currentDate,
    input.currentTime,
  );

  if (shiftStartMinutes == null || currentMinutes == null) {
    return null;
  }

  return `Starting in ${formatDurationValue(shiftStartMinutes - currentMinutes)}`;
}

function getHeroTiming(
  entry: MobileScheduleEntry | null,
  segmentStartTime: string | null,
  segmentEndTime: string | null,
  status: "active" | "upcoming" | "scheduled" | "away" | "empty",
  currentDate: string,
  currentTime: string,
): HeroTiming | null {
  if (!entry || !segmentStartTime || status === "away" || status === "empty") {
    return null;
  }

  const segmentStartMinutes = getLocalDateTimeMinutes(
    entry.date,
    segmentStartTime,
  );
  const currentMinutes = getLocalDateTimeMinutes(currentDate, currentTime);

  if (segmentStartMinutes == null || currentMinutes == null) {
    return null;
  }

  if (currentMinutes < segmentStartMinutes) {
    const startingInLabel = getStartingInLabel({
      currentDate,
      currentTime,
      shiftDate: entry.date,
      shiftStartTime: segmentStartTime,
    });

    return startingInLabel ? { label: startingInLabel, progress: null } : null;
  }

  if (!segmentEndTime) {
    return null;
  }

  const segmentEndMinutes = getLocalDateTimeMinutes(entry.date, segmentEndTime);

  if (segmentEndMinutes == null) {
    return null;
  }

  const normalizedEndMinutes =
    segmentEndMinutes <= segmentStartMinutes
      ? segmentEndMinutes + 24 * 60
      : segmentEndMinutes;

  if (
    currentMinutes < segmentStartMinutes ||
    currentMinutes >= normalizedEndMinutes
  ) {
    return null;
  }

  const totalMinutes = normalizedEndMinutes - segmentStartMinutes;
  const elapsedMinutes = Math.min(
    Math.max(currentMinutes - segmentStartMinutes, 0),
    totalMinutes,
  );

  if (totalMinutes <= 0) {
    return null;
  }

  return {
    progress: elapsedMinutes / totalMinutes,
    label: formatDurationLabel(normalizedEndMinutes - currentMinutes),
  };
}

function formatHoursValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function getRequestSegments(
  request: MobileShiftRequest,
  which: "requester" | "target",
) {
  const legacyRequest = request as MobileShiftRequest & {
    requesterSegments?: MobileShiftRequest["requesterPresentation"]["segments"];
    targetSegments?:
      | MobileShiftRequest["requesterPresentation"]["segments"]
      | null;
  };

  return which === "requester"
    ? (request.requesterPresentation?.segments ??
        legacyRequest.requesterSegments ??
        [])
    : (request.targetPresentation?.segments ??
        legacyRequest.targetSegments ??
        []);
}

function getRequestPrimarySegment(
  request: MobileShiftRequest,
  which: "requester" | "target",
) {
  return getRequestSegments(request, which)[0] ?? null;
}

function getRequestShiftName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string {
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
  const state =
    which === "requester" ? request.requesterState : request.targetState;
  if (state?.kind === "absence") {
    return state.absenceTypeId ?? null;
  }

  return which === "requester" ? (request.absenceTypeId ?? null) : null;
}

function getRequestJobName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  return (
    getRequestSegments(request, which).find((segment) => segment.jobName)
      ?.jobName ?? null
  );
}

function getRequestFocusAreaName(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  return (
    getRequestSegments(request, which).find(
      (segment) => segment.displayFocusAreaName,
    )?.displayFocusAreaName ?? null
  );
}

function getRequestTimeRange(
  request: MobileShiftRequest,
  which: "requester" | "target",
): string | null {
  const segments = getRequestSegments(request, which);
  const firstSegmentWithTime = segments.find(
    (segment) => segment.startTime && segment.endTime,
  );
  const lastSegmentWithTime =
    [...segments]
      .reverse()
      .find((segment) => segment.startTime && segment.endTime) ?? null;

  if (firstSegmentWithTime && lastSegmentWithTime) {
    return formatScheduleTimeRange(
      firstSegmentWithTime.startTime,
      lastSegmentWithTime.endTime,
    );
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

function getOpenShiftPrimarySegment(openShift: MobileOpenShift) {
  return openShift.presentation.segments[0] ?? null;
}

function getOpenShiftShiftName(openShift: MobileOpenShift): string {
  const primarySegment = getOpenShiftPrimarySegment(openShift);
  return (
    primarySegment?.shiftName ?? openShift.presentation.label ?? "Open Shift"
  );
}

function getOpenShiftAbsenceTypeId(openShift: MobileOpenShift): number | null {
  return openShift.state.kind === "absence"
    ? (openShift.state.absenceTypeId ?? null)
    : null;
}

function getOpenShiftJobChip(openShift: MobileOpenShift): JobChip | null {
  if (getOpenShiftAbsenceTypeId(openShift) != null) {
    return buildAbsenceChip(
      getOpenShiftShiftName(openShift),
      openShift.presentation,
    );
  }

  const primarySegment = getOpenShiftPrimarySegment(openShift);
  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      getOpenShiftShiftName(openShift),
      primarySegment,
    );
  }

  const jobSegment = openShift.presentation.segments.find(
    (segment) => segment.jobName,
  );
  return buildJobChip(jobSegment?.jobName ?? null, jobSegment ?? null);
}

function formatOpenShiftCardCountLabel(count: number): string {
  return `${count} open shift card${count === 1 ? "" : "s"}`;
}

function getOpenShiftFocusAreaName(openShift: MobileOpenShift): string | null {
  return (
    openShift.presentation.segments.find(
      (segment) => segment.displayFocusAreaName,
    )?.displayFocusAreaName ??
    openShift.presentation.displayFocusAreaName ??
    openShift.focusAreaName
  );
}

function getOpenShiftTimeRange(openShift: MobileOpenShift): string | null {
  const primarySegment = openShift.presentation.segments.find(
    (segment) => segment.startTime && segment.endTime,
  );

  if (primarySegment?.startTime && primarySegment.endTime) {
    return formatScheduleTimeRange(
      primarySegment.startTime,
      primarySegment.endTime,
    );
  }

  return openShift.presentation.startTime && openShift.presentation.endTime
    ? formatScheduleTimeRange(
        openShift.presentation.startTime,
        openShift.presentation.endTime,
      )
    : null;
}

function getSwipeEventX(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    changedTouches?: Array<{ pageX?: number }>;
    touches?: Array<{ pageX?: number }>;
  };

  if (typeof nativeEvent.pageX === "number") {
    return nativeEvent.pageX;
  }

  const changedTouchX = webNativeEvent.changedTouches?.[0]?.pageX;
  if (typeof changedTouchX === "number") {
    return changedTouchX;
  }

  const touchX = webNativeEvent.touches?.[0]?.pageX;
  if (typeof touchX === "number") {
    return touchX;
  }

  return null;
}

function getSwipeEventTimestamp(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    timeStamp?: number;
  };
  const webEvent = event as GestureResponderEvent & {
    timeStamp?: number;
    timestamp?: number;
  };
  const timestamp =
    nativeEvent.timestamp ??
    webNativeEvent.timeStamp ??
    webEvent.timestamp ??
    webEvent.timeStamp;

  return typeof timestamp === "number" ? timestamp : null;
}

function getWeekSwipeThreshold(width: number): number {
  return Math.max(WEEK_SWIPE_MIN_THRESHOLD, width * WEEK_SWIPE_THRESHOLD_RATIO);
}

function clampWeekSwipeDelta(value: number, width: number): number {
  if (width <= 0) {
    return value;
  }

  return Math.max(-width, Math.min(width, value));
}

function isCommittedWeekSwipe(input: {
  deltaX: number;
  elapsedMs: number | null;
  width: number;
}): boolean {
  const distance = Math.abs(input.deltaX);

  if (distance >= getWeekSwipeThreshold(input.width)) {
    return true;
  }

  if (input.elapsedMs == null || input.elapsedMs <= 0) {
    return false;
  }

  return (
    distance >= WEEK_SWIPE_FLICK_MIN_DISTANCE &&
    distance / input.elapsedMs >= WEEK_SWIPE_FLICK_VELOCITY
  );
}

export function ScheduleScreen({ scope }: { scope: ScheduleScope }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const { pushToast } = useToast();
  const bootstrapQuery = useBootstrap(accessToken);
  const now = useRealtimeNow();
  const [selectedTeamFocusAreaKey, setSelectedTeamFocusAreaKey] = useState<
    string | null
  >(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedDateOverride, setSelectedDateOverride] = useState<
    string | null
  >(null);
  const [weekStripWidth, setWeekStripWidth] = useState(0);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<string | null>(
    null,
  );
  const [pendingAction, setPendingAction] =
    useState<PendingRequestAction>(null);
  const [requestActionConfirmation, setRequestActionConfirmation] =
    useState<RequestActionConfirmation>(null);
  const meScrollViewRef = useRef<ScreenScrollHandle | null>(null);
  const pendingMeScrollKeyRef = useRef<string | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartTimestampRef = useRef<number | null>(null);
  const selectedDateRef = useRef<string | null>(null);
  const weekStripTranslateX = useRef(new Animated.Value(0)).current;
  const weekTransitionRef = useRef<Animated.CompositeAnimation | null>(null);
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const todayDate = getIsoDateInTimeZone(now, timeZone);
  const selectedDate = selectedDateOverride ?? todayDate;
  selectedDateRef.current = selectedDate;
  const range = useMemo(
    () => getScheduleRangeForDate(selectedDate),
    [selectedDate],
  );
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.permissions.canViewSchedule
    : false;
  const isTeamScope = scope === "team";
  const isBlockedTeamView =
    isTeamScope && !canViewTeamSchedule && Boolean(bootstrapQuery.data);
  const canLoadSchedule =
    Boolean(accessToken) && (!isTeamScope || canViewTeamSchedule);
  const canLoadRequests = Boolean(accessToken) && !isTeamScope;
  const canLoadMeTeamSchedule =
    Boolean(accessToken) && !isTeamScope && canViewTeamSchedule;
  const scheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      scope,
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () =>
      isTeamScope
        ? getOrgSchedule(accessToken!, range)
        : getMySchedule(accessToken!, range),
    enabled: canLoadSchedule,
  });
  const meTeamScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      "team",
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () => getOrgSchedule(accessToken!, range),
    enabled: canLoadMeTeamSchedule,
  });
  const requestsQuery = useQuery({
    queryKey: [
      "mobile",
      "requests",
      accessToken,
      range.startDate,
      range.endDate,
    ],
    queryFn: () => getShiftRequests(accessToken!, range),
    enabled: canLoadRequests,
  });
  const refetchBootstrap = bootstrapQuery.refetch;
  const refetchSchedule = scheduleQuery.refetch;
  const refetchMeTeamSchedule = meTeamScheduleQuery.refetch;
  const refetchRequests = requestsQuery.refetch;
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
          queryKey: ["mobile", "requests", accessToken],
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
    setPendingAction({
      key: feedback.key,
      label: feedback.pendingLabel,
    });
    requestActionMutation.mutate(
      { requestId, body },
      {
        onSettled: () => {
          setPendingAction(null);
        },
      },
    );
  }, [requestActionConfirmation, requestActionMutation]);

  const activeData = scheduleQuery.data;
  const scheduleEntries = activeData?.entries ?? [];
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const canManageEmployees = Boolean(
    bootstrapQuery.data?.permissions.canManageEmployees,
  );
  const unreadNotificationCount =
    bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const selectedDateLabel = formatScheduleDayLabel(selectedDate, now, timeZone);
  const teamHeaderDateLabel = formatTeamScheduleHeaderDateLabel(
    selectedDate,
    now,
    timeZone,
  );
  const isSelectedToday = selectedDate === todayDate;
  const weekRangeLabel = formatScheduleRange(range, timeZone);
  const currentTimeValue = getCurrentTimeValue(now, timeZone);
  const visibleCalendarMonth =
    calendarMonthAnchor ?? getScheduleMonthStartDate(selectedDate);
  const monthCalendarLabel = formatScheduleMonthLabel(
    visibleCalendarMonth,
    timeZone,
  );
  const previousWeekDate = addDaysToIsoDate(selectedDate, -7);
  const nextWeekDate = addDaysToIsoDate(selectedDate, 7);
  const previousWeekDays = useMemo(
    () =>
      buildScheduleWeekDays(
        getScheduleRangeForDate(previousWeekDate),
        previousWeekDate,
        timeZone,
      ),
    [previousWeekDate, timeZone],
  );
  const weekDays = useMemo(
    () => buildScheduleWeekDays(range, selectedDate, timeZone),
    [range, selectedDate, timeZone],
  );
  const nextWeekDays = useMemo(
    () =>
      buildScheduleWeekDays(
        getScheduleRangeForDate(nextWeekDate),
        nextWeekDate,
        timeZone,
      ),
    [nextWeekDate, timeZone],
  );
  const monthWeeks = useMemo(
    () => buildScheduleMonthDays(visibleCalendarMonth, selectedDate, timeZone),
    [selectedDate, timeZone, visibleCalendarMonth],
  );
  const selectedDayTeamEntries = useMemo(
    () =>
      isTeamScope
        ? filterScheduleEntriesByDate(scheduleEntries, selectedDate)
        : [],
    [isTeamScope, scheduleEntries, selectedDate],
  );
  const teamFocusAreaTabs = useMemo(() => {
    if (isBlockedTeamView) {
      return [];
    }

    return buildTeamScheduleFocusAreaTabs(
      bootstrapQuery.data?.focusAreas ?? [],
      scheduleEntries,
    );
  }, [bootstrapQuery.data?.focusAreas, isBlockedTeamView, scheduleEntries]);
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

  useEffect(() => {
    if (defaultTeamFocusAreaKey == null) {
      if (selectedTeamFocusAreaKey != null) {
        setSelectedTeamFocusAreaKey(null);
      }
      return;
    }

    if (
      selectedTeamFocusAreaKey == null ||
      !teamFocusAreaTabs.some((tab) => tab.key === selectedTeamFocusAreaKey)
    ) {
      setSelectedTeamFocusAreaKey(defaultTeamFocusAreaKey);
    }
  }, [teamFocusAreaTabs, defaultTeamFocusAreaKey, selectedTeamFocusAreaKey]);

  const activeEntries = useMemo(() => {
    if (!isTeamScope) {
      return scheduleEntries;
    }
    if (!activeTeamFocusAreaKey) {
      return selectedDayTeamEntries;
    }

    return filterTeamScheduleEntriesByFocusArea(
      selectedDayTeamEntries,
      activeTeamFocusAreaKey,
    );
  }, [
    activeTeamFocusAreaKey,
    isTeamScope,
    scheduleEntries,
    selectedDayTeamEntries,
  ]);
  const selectedEntries = useMemo(
    () =>
      isTeamScope
        ? activeEntries
        : filterScheduleEntriesByDate(activeEntries, selectedDate),
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
    [
      activeEntries,
      currentTimeValue,
      isTeamScope,
      range.startDate,
      selectedDate,
      todayDate,
    ],
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
    [
      currentTimeValue,
      isTeamScope,
      meHeroState.item,
      meHeroState.status,
      todayDate,
    ],
  );
  const meHeroShiftmates = useMemo(
    () =>
      !isTeamScope && canLoadMeTeamSchedule
        ? getMeHeroShiftmates(
            meHeroState.item,
            meTeamScheduleQuery.data?.entries ?? [],
          )
        : [],
    [
      canLoadMeTeamSchedule,
      isTeamScope,
      meHeroState.item,
      meTeamScheduleQuery.data?.entries,
    ],
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
  const isMeScheduleEmpty =
    !isTeamScope && !meHeroState.item && meUpcomingItems.length === 0;
  const meEmptyPageMinHeight = Math.max(
    320,
    viewportHeight - insets.top - insets.bottom - 180,
  );
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
    [
      isTeamScope,
      linkedEmployee?.id,
      now,
      requestsQuery.data?.requests,
      timeZone,
    ],
  );
  const meOpenShifts = !isTeamScope
    ? (requestsQuery.data?.openShifts ?? [])
    : [];
  const meWeeklyHours = useMemo(
    () => (!isTeamScope ? buildWeeklyHoursSummary(activeEntries, 40) : null),
    [activeEntries, isTeamScope],
  );
  const shiftGroups = useMemo(
    () => buildTeamScheduleShiftGroupsForView(selectedEntries),
    [selectedEntries],
  );
  const contentState = getMobileQueryContentState({
    hasData: Boolean(activeData) && Boolean(bootstrapQuery.data),
    isLoading: scheduleQuery.isLoading || bootstrapQuery.isLoading,
    error: scheduleQuery.error ?? bootstrapQuery.error,
  });
  const emptyStateTitle = "Nothing to show yet";
  const rawEmptyStateDateLabel = formatScheduleDayLabel(
    selectedDate,
    now,
    timeZone,
  );
  const emptyStateDateLabel = /^(Today|Yesterday|Tomorrow),/.test(
    rawEmptyStateDateLabel,
  )
    ? rawEmptyStateDateLabel.charAt(0).toLowerCase() +
      rawEmptyStateDateLabel.slice(1)
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

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          void refetchScreenContent();
        }
      },
    );

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
  }, [
    contentState.kind,
    isTeamScope,
    linkedEmployee,
    range.startDate,
    selectedDate,
  ]);

  function closeAnchoredPopups() {
    setIsCalendarOpen(false);
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
    setCalendarMonthAnchor(getScheduleMonthStartDate(nextDate));
    closeAnchoredPopups();
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
      damping: 18,
      stiffness: 220,
      mass: 0.7,
      useNativeDriver: true,
    });

    weekTransitionRef.current = resetAnimation;
    resetAnimation.start(() => {
      weekTransitionRef.current = null;
    });
  }

  function completeWeekSwipe(direction: -1 | 1, deltaX: number) {
    const nextDate = addDaysToIsoDate(
      getCommittedSelectedDate(),
      direction * 7,
    );
    const completeOffset = getWeekSwipeWidth();
    const releaseOffset = clampWeekSwipeDelta(deltaX, completeOffset);
    const rebasedOffset = direction * completeOffset + releaseOffset;

    closeAnchoredPopups();
    weekTransitionRef.current?.stop();
    weekStripTranslateX.setValue(rebasedOffset);
    commitSelectedDate(nextDate);

    const settleAnimation = Animated.spring(weekStripTranslateX, {
      toValue: 0,
      damping: 22,
      stiffness: 260,
      mass: 0.8,
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

  function handleWeekSwipeEnd(
    releaseX: number,
    releaseTimestamp: number | null,
  ) {
    if (swipeStartXRef.current == null) {
      return;
    }

    const deltaX = releaseX - swipeStartXRef.current;
    const startTimestamp = swipeStartTimestampRef.current;
    swipeStartXRef.current = null;
    swipeStartTimestampRef.current = null;
    const swipeWidth = getWeekSwipeWidth();
    const elapsedMs =
      releaseTimestamp != null && startTimestamp != null
        ? releaseTimestamp - startTimestamp
        : null;

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
    weekTransitionRef.current?.stop();
    swipeStartXRef.current = getSwipeEventX(event);
    swipeStartTimestampRef.current = getSwipeEventTimestamp(event);
  }

  function handleWeekSwipeMove(event: GestureResponderEvent) {
    if (swipeStartXRef.current == null) {
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

  function handlePreviousWeek() {
    closeAnchoredPopups();
    commitSelectedDate(addDaysToIsoDate(getCommittedSelectedDate(), -7));
  }

  function handleNextWeek() {
    closeAnchoredPopups();
    commitSelectedDate(addDaysToIsoDate(getCommittedSelectedDate(), 7));
  }

  function handleGoToToday() {
    closeAnchoredPopups();
    commitSelectedDate(null);
  }

  function handleToggleCalendar() {
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      return;
    }

    setCalendarMonthAnchor(getScheduleMonthStartDate(selectedDate));
    setIsCalendarOpen(true);
  }

  function handleSelectFocusArea(nextFocusAreaKey: string) {
    setSelectedTeamFocusAreaKey(nextFocusAreaKey);

    const nextSelectedDayEntries = filterTeamScheduleEntriesByFocusArea(
      selectedDayTeamEntries,
      nextFocusAreaKey,
    );

    if (nextSelectedDayEntries.length === 0) {
      const firstMatchingDate = getFirstDateForFocusArea(
        scheduleEntries,
        nextFocusAreaKey,
      );

      if (firstMatchingDate && firstMatchingDate !== selectedDate) {
        commitSelectedDate(firstMatchingDate);
        setCalendarMonthAnchor(getScheduleMonthStartDate(firstMatchingDate));
      }
    }

    closeAnchoredPopups();
  }

  function handlePreviousMonth() {
    setCalendarMonthAnchor((current) =>
      addMonthsToIsoDate(
        current ?? getScheduleMonthStartDate(selectedDate),
        -1,
      ),
    );
  }

  function handleNextMonth() {
    setCalendarMonthAnchor((current) =>
      addMonthsToIsoDate(current ?? getScheduleMonthStartDate(selectedDate), 1),
    );
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
  ) : undefined;

  const stickyHeader = isTeamScope ? (
    <View style={styles.stickyControlsSection}>
      <View style={styles.teamHeaderUtilityRow}>
        <View style={styles.teamHeaderTitleArea}>
          <Text numberOfLines={1} style={styles.teamHeaderTitle}>
            {teamHeaderDateLabel}
          </Text>
        </View>
        <View style={styles.teamHeaderActions}>
          <View style={styles.calendarMenuAnchor}>
            <IconControlButton
              accessibilityLabel="Open month calendar"
              iconName="calendar-outline"
              onPress={handleToggleCalendar}
            />
          </View>
          <AlertsChromeButton unreadCount={unreadNotificationCount} />
        </View>
      </View>

      <View
        accessibilityLabel="Schedule week strip"
        onLayout={(event) => {
          setWeekStripWidth(event.nativeEvent.layout.width);
        }}
        onTouchCancel={handleWeekSwipeCancel}
        onTouchEnd={handleWeekSwipeRelease}
        onTouchMove={handleWeekSwipeMove}
        onTouchStart={handleWeekSwipeStart}
        style={styles.weekStripFrame}
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
              style={[
                styles.weekStrip,
                {
                  width: weekStripRenderWidth,
                },
              ]}
            >
              {row.days.map((day) => (
                <DayChip
                  key={day.date}
                  day={day}
                  onPress={() => handleSelectDate(day.date)}
                />
              ))}
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  ) : (
    meStickyHeader
  );

  const activePopupTop = Math.max(insets.top, 8) + 52;
  const renderAnchoredPopupOverlay =
    isTeamScope && isCalendarOpen
      ? () => (
          <View style={styles.popupOverlayRoot}>
            <Pressable
              accessibilityLabel="Dismiss schedule popup"
              accessibilityRole="button"
              onPress={closeAnchoredPopups}
              style={styles.popupDismissLayer}
            />
            {isCalendarOpen ? (
              <AnchoredPopupSurface
                accessibilityLabel="Month calendar popup"
                style={[
                  styles.monthCalendarPopupSurface,
                  {
                    right: SCHEDULE_CALENDAR_POPUP_RIGHT_OFFSET,
                    top: activePopupTop,
                  },
                ]}
              >
                <MonthCalendar
                  monthLabel={monthCalendarLabel}
                  weeks={monthWeeks}
                  onNextMonth={handleNextMonth}
                  onPreviousMonth={handlePreviousMonth}
                  onSelectDate={handleSelectDate}
                />
              </AnchoredPopupSurface>
            ) : null}
          </View>
        )
      : undefined;

  return (
    <Screen
      bottomPaddingMode="tabbed"
      refreshing={manualRefresh.isRefreshing}
      onRefresh={manualRefresh.refresh}
      renderOverlay={renderAnchoredPopupOverlay}
      scrollViewRef={!isTeamScope ? meScrollViewRef : undefined}
      stickyHeader={stickyHeader}
      stickyHeaderShellStyle={styles.scheduleCalendarStickyHeaderShell}
    >
      {isTeamScope && teamFocusAreaTabs.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.focusAreaPillListContent}
          style={styles.focusAreaPillList}
        >
          {teamFocusAreaTabs.map((tab) => {
            const isActive = tab.key === activeTeamFocusAreaKey;

            return (
              <Pressable
                key={tab.key}
                accessibilityLabel={`Select ${tab.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => {
                  handleSelectFocusArea(tab.key);
                }}
                style={({ pressed }) => [
                  styles.focusAreaPill,
                  isActive && styles.focusAreaPillActive,
                  pressed && styles.focusAreaPillPressed,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.focusAreaPillText,
                    isActive && styles.focusAreaPillTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {contentState.kind === "loading" ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingTitle}>Loading schedule</Text>
          <Text style={styles.loadingBody}>
            Getting the latest published schedule.
          </Text>
          {!isTeamScope ? (
            <>
              <HeroSkeleton />
              <ListSkeleton rows={2} />
              <ListSkeleton rows={2} />
            </>
          ) : (
            <ListSkeleton rows={4} showSectionHeader={false} />
          )}
        </View>
      ) : contentState.kind === "error" ? (
        <StatusBanner
          actionLabel="Try again"
          body={contentState.message}
          fillScreen
          title="Could not load schedule"
          variant="centered"
          onAction={() => {
            void refetchScreenContent();
          }}
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
            isMeScheduleEmpty && [
              styles.mePageEmpty,
              { minHeight: meEmptyPageMinHeight },
            ],
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
              meHeroState.item
                ? () => handleOpenShiftDetail(meHeroState.item!.entry)
                : undefined
            }
          />
          {isMeScheduleEmpty ? null : (
            <>
              <ShiftCoverRequestsSection
                isLoading={requestsQuery.isLoading}
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
                isLoading={requestsQuery.isLoading}
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
              />
              <UpcomingShiftsSection
                items={meUpcomingItems}
                onPressEntry={handleOpenShiftDetail}
                summary={meWeeklyHours}
                todayDate={todayDate}
              />
            </>
          )}
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
        confirmLabel={
          requestActionConfirmation?.feedback.confirmLabel ?? "Confirm"
        }
        confirmTone={
          requestActionConfirmation?.feedback.confirmStyle === "destructive"
            ? "dangerFilled"
            : "primary"
        }
        onCancel={() => setRequestActionConfirmation(null)}
        onConfirm={confirmRequestAction}
        title={requestActionConfirmation?.feedback.title ?? "Confirm action?"}
        visible={Boolean(requestActionConfirmation)}
      />
    </Screen>
  );
}

function DayChip({
  day,
  onPress,
}: {
  day: MobileScheduleWeekDay;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Select ${day.date}`}
      accessibilityRole="button"
      accessibilityState={{ selected: day.isSelected }}
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)", borderless: true }}
      onPress={onPress}
      style={styles.dayChip}
    >
      <View
        style={[
          styles.dayChipBody,
          day.isSelected && !day.isToday && styles.dayChipBodySelected,
          day.isSelected && day.isToday && styles.dayChipBodyToday,
        ]}
      >
        <Text
          style={[
            styles.dayChipWeekday,
            day.isSelected && !day.isToday && styles.dayChipWeekdaySelected,
            day.isToday && !day.isSelected && styles.dayChipWeekdayToday,
            day.isSelected && day.isToday && styles.dayChipWeekdayTodaySelected,
          ]}
        >
          {day.weekdayLabel}
        </Text>
        <Text
          style={[
            styles.dayChipDay,
            day.isSelected && !day.isToday && styles.dayChipDaySelected,
            day.isToday && !day.isSelected && styles.dayChipDayToday,
            day.isSelected && day.isToday && styles.dayChipDayTodaySelected,
          ]}
        >
          {day.dayLabel}
        </Text>
      </View>
    </Pressable>
  );
}

function MonthCalendar({
  monthLabel,
  weeks,
  onNextMonth,
  onPreviousMonth,
  onSelectDate,
}: {
  monthLabel: string;
  weeks: MobileScheduleMonthDay[][];
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onSelectDate: (date: string) => void;
}) {
  return (
    <View style={styles.monthCalendar}>
      <View style={styles.monthCalendarHeader}>
        <IconControlButton
          accessibilityLabel="Previous month"
          iconName="chevron-back"
          iconSize={10}
          onPress={onPreviousMonth}
        />
        <Text style={styles.monthCalendarTitle}>{monthLabel}</Text>
        <IconControlButton
          accessibilityLabel="Next month"
          iconName="chevron-forward"
          iconSize={10}
          onPress={onNextMonth}
        />
      </View>

      <View style={styles.monthCalendarWeekdays}>
        {MONTH_WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.monthCalendarWeekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.monthCalendarWeeks}>
        {weeks.map((week) => (
          <View key={week[0]?.date ?? "week"} style={styles.monthCalendarWeek}>
            {week.map((day) => (
              <Pressable
                key={day.date}
                accessibilityLabel={`Select date ${day.date}`}
                accessibilityRole="button"
                accessibilityState={{ selected: day.isSelected }}
                android_ripple={{
                  color: "rgba(15, 23, 42, 0.08)",
                  borderless: true,
                }}
                onPress={() => onSelectDate(day.date)}
                style={[
                  styles.monthCalendarDay,
                  day.isSelected && styles.monthCalendarDaySelected,
                  day.isToday &&
                    !day.isSelected &&
                    styles.monthCalendarDayToday,
                ]}
              >
                <Text
                  style={[
                    styles.monthCalendarDayText,
                    !day.isCurrentMonth &&
                      styles.monthCalendarDayTextOutsideMonth,
                    day.isSelected && styles.monthCalendarDayTextSelected,
                  ]}
                >
                  {day.dayLabel}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
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
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)", borderless: true }}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconControlButton,
        pressed && styles.iconControlButtonPressed,
      ]}
    >
      <Ionicons
        color={mobileColors.textPrimary}
        name={iconName}
        size={iconSize}
      />
    </Pressable>
  );
}

function AlertsChromeButton({ unreadCount }: { unreadCount: number }) {
  return (
    <Pressable
      accessibilityLabel="Open alerts"
      accessibilityRole="button"
      android_ripple={{ color: "rgba(15, 23, 42, 0.08)", borderless: true }}
      hitSlop={10}
      onPress={() => router.push("/alerts")}
      style={({ pressed }) => [
        styles.iconControlButton,
        pressed && styles.iconControlButtonPressed,
      ]}
    >
      <Ionicons
        color={mobileColors.textPrimary}
        name="notifications-outline"
        size={20}
      />
      {unreadCount > 0 ? (
        <View style={styles.alertBadge}>
          <Text style={styles.alertBadgeText}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Text>
        </View>
      ) : null}
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

function joinMetaParts(parts: Array<string | null | undefined>): string | null {
  const values = parts.filter(
    (part): part is string =>
      typeof part === "string" && part.trim().length > 0,
  );

  return values.length > 0 ? values.join(" • ") : null;
}

function getScheduleItemShiftName(
  item: FeaturedMeScheduleSegment["item"],
): string {
  if (!item) {
    return "Nothing scheduled this week";
  }

  return item.segment.shiftName || getScheduleEntryTitle(item.entry);
}

function getScheduleItemJobName(
  item: FeaturedMeScheduleSegment["item"],
): string | null {
  if (!item || getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return null;
  }

  return item.segment.jobName ?? null;
}

function getScheduleItemFocusArea(
  item: FeaturedMeScheduleSegment["item"],
): string | null {
  if (!item) {
    return null;
  }

  return getScheduleEntrySegmentFocusAreaName(item.entry, item.segment);
}

type JobColorSource = {
  jobColor?: string | null;
  jobBorderColor?: string | null;
  jobTextColor?: string | null;
  isMentored?: boolean | null;
};

type JobChipKind = "job" | "general" | "absence";

type JobChip = AvatarTone & {
  kind: JobChipKind;
  label: string;
  eyebrowLabel?: string | null;
  isMentored?: boolean;
};

type AbsenceColorSource = Pick<
  MobileScheduleEntry["presentation"],
  "shiftColor" | "shiftBorderColor" | "shiftTextColor"
>;

function readOptionalColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.toLowerCase() === "transparent" ? null : trimmedValue;
}

function readOptionalStyleColor(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeScheduleLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildAbsenceChip(
  label: string | null | undefined,
  colorSource?: AbsenceColorSource | null,
): JobChip | null {
  const trimmedLabel = label?.trim() ?? "";
  const absenceColor = readOptionalStyleColor(colorSource?.shiftColor);
  const absenceBorderColor = readOptionalStyleColor(
    colorSource?.shiftBorderColor,
  );
  const absenceTextColor = readOptionalStyleColor(colorSource?.shiftTextColor);

  if (!trimmedLabel) {
    return null;
  }

  return {
    kind: "absence",
    eyebrowLabel: "Absence",
    label: trimmedLabel,
    backgroundColor: absenceColor ?? mobileColors.surfaceSecondary,
    borderColor: absenceBorderColor ?? mobileColors.border,
    textColor: absenceTextColor ?? mobileColors.textMuted,
  };
}

function hasMentoredSegments(
  segments: ReadonlyArray<{ isMentored?: boolean | null }> | null | undefined,
): boolean {
  return segments?.some((segment) => segment.isMentored === true) ?? false;
}

function MentoredPill() {
  return (
    <View accessibilityLabel="Mentored assignment" style={styles.mentoredPill}>
      <Text style={styles.mentoredPillText}>Mentored</Text>
    </View>
  );
}

function buildGeneralShiftChip(
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const chip = buildJobChip(label, colorSource);

  if (!chip) {
    return null;
  }

  return {
    ...chip,
    kind: "general",
    eyebrowLabel: "General shift",
  };
}

function isGeneralShiftSegment(
  segment: { shiftId?: number | null } | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

function buildJobChip(
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  const trimmedLabel = label?.trim() ?? "";
  const jobColor = readOptionalColor(colorSource?.jobColor);
  const jobBorderColor = readOptionalColor(colorSource?.jobBorderColor);
  const jobTextColor = readOptionalColor(colorSource?.jobTextColor);

  if (!trimmedLabel) {
    return null;
  }

  if (jobColor || jobBorderColor || jobTextColor) {
    return {
      kind: "job",
      label: trimmedLabel,
      backgroundColor: jobColor ?? mobileColors.surfaceSecondary,
      borderColor: jobBorderColor ?? mobileColors.border,
      textColor: jobTextColor ?? mobileColors.textMuted,
      isMentored: colorSource?.isMentored === true,
    };
  }

  const normalizedLabel = trimmedLabel.toLowerCase();
  const tone =
    normalizedLabel.includes("supervisor") ||
    normalizedLabel.includes("lead") ||
    normalizedLabel.includes("manager")
      ? {
          backgroundColor: "#FCE7F3",
          borderColor: "#FBCFE8",
          textColor: "#BE185D",
        }
      : normalizedLabel.includes("mentor") ||
          normalizedLabel.includes("trainer")
        ? {
            backgroundColor: mobileColors.warningSoft,
            borderColor: mobileColors.warningBorder,
            textColor: "#B45309",
          }
        : normalizedLabel.includes("nurse") ||
            normalizedLabel.includes("rn") ||
            normalizedLabel.includes("lpn")
          ? {
              backgroundColor: "#ECFEFF",
              borderColor: "#A5F3FC",
              textColor: "#0E7490",
            }
          : {
              backgroundColor: mobileColors.surfaceSecondary,
              borderColor: mobileColors.border,
              textColor: mobileColors.textMuted,
            };

  return {
    kind: "job",
    label: trimmedLabel,
    isMentored: colorSource?.isMentored === true,
    ...tone,
  };
}

function getScheduleItemJobChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  if (!item) {
    return null;
  }

  if (getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return buildAbsenceChip(
      getScheduleItemShiftName(item),
      item.entry.presentation,
    );
  }

  if (isGeneralShiftSegment(item.segment)) {
    return buildGeneralShiftChip(getScheduleItemShiftName(item), item.segment);
  }

  const jobName = getScheduleItemJobName(item);
  return buildJobChip(jobName, item.segment);
}

function getSegmentJobChip(
  segment: MobileScheduleEntrySegment,
): JobChip | null {
  if (isGeneralShiftSegment(segment)) {
    return buildGeneralShiftChip(segment.shiftName ?? segment.label, segment);
  }

  return buildJobChip(segment.jobName ?? null, segment);
}

function getScheduleItemTypeChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  return getScheduleItemJobChip(item);
}

function getVisibleScheduleItemTypeChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  const typeChip = getScheduleItemTypeChip(item);

  if (!item || !typeChip) {
    return typeChip;
  }

  if (typeChip.kind !== "job") {
    return typeChip;
  }

  const chipLabel = normalizeScheduleLabel(typeChip.label);
  const shiftLabels = [
    getScheduleItemShiftName(item),
    item.segment.shiftName,
    item.segment.label,
    item.entry.presentation?.label,
  ].map(normalizeScheduleLabel);

  return chipLabel.length > 0 && shiftLabels.includes(chipLabel)
    ? null
    : typeChip;
}

function shouldShowMePrimaryTitle(
  title: string | null | undefined,
  chip: JobChip | null,
): boolean {
  if (!chip?.eyebrowLabel) {
    return true;
  }

  return normalizeScheduleLabel(title) !== normalizeScheduleLabel(chip.label);
}

function getScheduleItemTimeRange(
  item: FeaturedMeScheduleSegment["item"],
): string | null {
  if (!item) {
    return null;
  }

  const segmentCount = getScheduleEntrySegments(item.entry).length;

  if (segmentCount <= 1) {
    return (
      getScheduleEntryCustomTimeRange(item.entry) ??
      getScheduleEntrySegmentTimeRange(item.segment) ??
      getScheduleEntryBaseTimeRange(item.entry)
    );
  }

  return (
    getScheduleEntrySegmentTimeRange(item.segment) ??
    getScheduleEntryBaseTimeRange(item.entry)
  );
}

function getScheduleItemSplitShiftLabel(
  item: FeaturedMeScheduleSegment["item"],
): string | null {
  if (!item) {
    return null;
  }

  const splitSegments = getSplitShiftSegmentsForEntry(item.entry);
  const segmentIndex = splitSegments.indexOf(item.segment);
  if (splitSegments.length <= 1 || segmentIndex < 0) {
    return null;
  }

  return getSplitShiftSegmentLabel(segmentIndex, splitSegments.length);
}

function doScheduleSegmentsMatch(
  left: MobileScheduleEntrySegment,
  right: MobileScheduleEntrySegment,
): boolean {
  return (
    left === right ||
    (left.shiftId === right.shiftId &&
      left.jobId === right.jobId &&
      left.shiftName === right.shiftName &&
      left.jobName === right.jobName &&
      left.startTime === right.startTime &&
      left.endTime === right.endTime)
  );
}

function getMeHeroSupplementalSplitSegments(
  item: FeaturedMeScheduleSegment["item"],
  splitSegments: ReadonlyArray<MobileScheduleEntrySegment>,
  currentDate: string,
  currentTime: string,
): {
  segments: MobileScheduleEntrySegment[];
  segmentLabelIndices: number[];
} {
  if (!item || splitSegments.length <= 1) {
    return { segments: [], segmentLabelIndices: [] };
  }

  const featuredSegmentIndex = splitSegments.findIndex((segment) =>
    doScheduleSegmentsMatch(segment, item.segment),
  );
  const hiddenSegmentIndex =
    featuredSegmentIndex >= 0 ? featuredSegmentIndex : 0;
  const segments: MobileScheduleEntrySegment[] = [];
  const segmentLabelIndices: number[] = [];

  splitSegments.forEach((segment, index) => {
    if (index === hiddenSegmentIndex) {
      return;
    }

    if (
      isHeroSplitSegmentComplete(item.entry, segment, currentDate, currentTime)
    ) {
      return;
    }

    segments.push(segment);
    segmentLabelIndices.push(index);
  });

  return { segments, segmentLabelIndices };
}

function isHeroSplitSegmentComplete(
  entry: MobileScheduleEntry,
  segment: MobileScheduleEntrySegment,
  currentDate: string,
  currentTime: string,
): boolean {
  const segmentStartTime = getSegmentStartTime(segment);
  const segmentEndTime = getSegmentEndTime(segment);

  if (!segmentStartTime || !segmentEndTime) {
    return false;
  }

  const segmentStartMinutes = getLocalDateTimeMinutes(
    entry.date,
    segmentStartTime,
  );
  const segmentEndMinutes = getLocalDateTimeMinutes(entry.date, segmentEndTime);
  const currentMinutes = getLocalDateTimeMinutes(currentDate, currentTime);

  if (
    segmentStartMinutes == null ||
    segmentEndMinutes == null ||
    currentMinutes == null
  ) {
    return false;
  }

  const normalizedEndMinutes =
    segmentEndMinutes <= segmentStartMinutes
      ? segmentEndMinutes + 24 * 60
      : segmentEndMinutes;

  return currentMinutes >= normalizedEndMinutes;
}

function getScheduleSegmentMatchKey(
  segment: MobileScheduleEntrySegment,
): string | null {
  if (segment.shiftId != null) {
    return `shift:${segment.shiftId}`;
  }

  const title = segment.shiftName?.trim() || segment.label?.trim();
  return title
    ? `segment:${title}:${segment.startTime ?? "none"}:${segment.endTime ?? "none"}`
    : null;
}

function entriesShareWorkedSegment(
  left: MobileScheduleEntry,
  rightEntry: MobileScheduleEntry,
  rightSegment: MobileScheduleEntrySegment,
  rightKey: string | null,
): boolean {
  if (!rightKey) {
    return false;
  }

  for (const segment of getScheduleEntrySegments(left)) {
    if (
      getScheduleSegmentMatchKey(segment) === rightKey &&
      doScheduleEntrySegmentsShareShiftAndFocusArea(
        rightEntry,
        rightSegment,
        left,
        segment,
      )
    ) {
      return true;
    }
  }

  return false;
}

function getMeHeroShiftmates(
  item: FeaturedMeScheduleSegment["item"],
  teamEntries: MobileScheduleEntry[],
): MobileScheduleEntry[] {
  if (
    !item ||
    getScheduleEntryAbsenceTypeId(item.entry) != null ||
    isGeneralShiftSegment(item.segment)
  ) {
    return [];
  }

  const featuredSegmentKey = getScheduleSegmentMatchKey(item.segment);
  const matchingEntries = teamEntries.filter(
    (entry) =>
      entry.date === item.date &&
      entry.employeeId !== item.entry.employeeId &&
      getScheduleEntryAbsenceTypeId(entry) == null &&
      entriesShareWorkedSegment(
        entry,
        item.entry,
        item.segment,
        featuredSegmentKey,
      ),
  );

  return sortScheduleEntries(
    matchingEntries.filter(
      (entry, index, entries) =>
        entries.findIndex(
          (candidate) => candidate.employeeId === entry.employeeId,
        ) === index,
    ),
  );
}

function getRequestDateLabel(request: MobileShiftRequest): string {
  return formatCompactScheduleDate(request.requesterShiftDate);
}

function getRequestJobChip(
  request: MobileShiftRequest,
  which: "requester" | "target",
): JobChip | null {
  if (getRequestAbsenceTypeId(request, which) != null) {
    const presentation =
      which === "requester"
        ? request.requesterPresentation
        : request.targetPresentation;
    return buildAbsenceChip(getRequestShiftName(request, which), presentation);
  }

  const primarySegment = getRequestPrimarySegment(request, which);

  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(
      getRequestShiftName(request, which),
      primarySegment,
    );
  }

  const segment =
    getRequestSegments(request, which).find((item) => item.jobName) ?? null;
  const jobName = getRequestJobName(request, which);
  return buildJobChip(jobName, segment);
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
  if (!chip) {
    return isMentored ? <MentoredPill /> : null;
  }

  const accessibilityLabel = chip.eyebrowLabel
    ? `${chip.eyebrowLabel} ${chip.label}${
        isMentored ? " mentored assignment" : ""
      }`
    : `Job ${chip.label}${isMentored ? " mentored assignment" : ""}`;
  const showsLabeledValue = chip.eyebrowLabel != null;
  const shouldRenderEyebrowInsidePill =
    eyebrowDisplay === "inside" && chip.eyebrowLabel;
  const shouldRenderSingleLinePill =
    !showsLabeledValue || eyebrowDisplay === "outside";
  const pillBorderColor =
    chip.kind === "general"
      ? mobileBorderColorFromText(chip.textColor)
      : chip.borderColor;

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
              style={[styles.jobPillMentoredText, { color: chip.textColor }]}
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
              <Text
                style={[styles.jobPillMentoredText, { color: chip.textColor }]}
              >
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
          titleScale === "hero"
            ? styles.meTypePillLabelHero
            : styles.meTypePillLabelRow,
          inverseLabel && styles.meTypePillLabelInverse,
        ]}
      >
        {chip.eyebrowLabel}
      </Text>
      <JobPill
        chip={chip}
        compact={compact}
        eyebrowDisplay="outside"
        isMentored={isMentored}
      />
    </View>
  );
}

function MeHeroShiftmates({ entries }: { entries: MobileScheduleEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  const visibleEntries = entries.slice(0, 3);
  const overflowCount = entries.length - visibleEntries.length;

  return (
    <View style={styles.meHeroCollaborators}>
      <View style={styles.meHeroCollaboratorLabelRow}>
        <Ionicons
          color="rgba(255, 255, 255, 0.76)"
          name="people-outline"
          size={22}
        />
        <Text style={styles.meHeroCollaboratorLabel}>Working with</Text>
      </View>
      <View style={styles.meHeroAvatarStack}>
        {visibleEntries.map((entry, index) => {
          const avatarTone = getAvatarTone(entry.employeeId);

          return (
            <View
              key={`${entry.employeeId}-${entry.date}`}
              style={[
                styles.meHeroCollaboratorAvatarFrame,
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
                  style={[
                    styles.meHeroCollaboratorAvatarText,
                    { color: avatarTone.textColor },
                  ]}
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
              visibleEntries.length > 0 &&
                styles.meHeroCollaboratorAvatarFrameOverlap,
            ]}
          >
            <View style={styles.meHeroCollaboratorOverflow}>
              <Text style={styles.meHeroCollaboratorOverflowText}>
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
  const typeChip = getVisibleScheduleItemTypeChip(featuredItem);
  const shouldShowShiftName = shouldShowMePrimaryTitle(shiftName, typeChip);
  const focusAreaName = getScheduleItemFocusArea(featuredItem);
  const timeRange = getScheduleItemTimeRange(featuredItem);
  const splitSegments = featuredItem
    ? getSplitShiftSegmentsForEntry(featuredItem.entry)
    : [];
  const splitShiftCount = splitSegments.length;
  const heroSplitSegments = getMeHeroSupplementalSplitSegments(
    featuredItem,
    splitSegments,
    currentDate,
    currentTime,
  );
  const heroSplitShiftLabel = getScheduleItemSplitShiftLabel(featuredItem);
  const shouldShowHeroSplitBadge =
    splitShiftCount > 1 && heroSplitSegments.segments.length > 0;
  const badgeDotStyle =
    status === "active"
      ? styles.meHeroBadgeDotActive
      : status === "away" || status === "empty"
        ? styles.meHeroBadgeDotMuted
        : styles.meHeroBadgeDotScheduled;

  const cardContent = (
    <View style={styles.meHeroContent}>
      {badgeLabel || heroDateParts ? (
        <View style={styles.meHeroHeader}>
          {badgeLabel ? (
            <View style={styles.meHeroBadge}>
              <View style={[styles.meHeroBadgeDot, badgeDotStyle]} />
              <Text style={styles.meHeroBadgeText}>{badgeLabel}</Text>
            </View>
          ) : null}
          {heroDateParts ? (
            <View
              accessibilityLabel={heroDateLabel ?? undefined}
              style={styles.meHeroDateTile}
            >
              <Text style={styles.meHeroDateWeekday}>
                {heroDateParts.weekdayLabel}
              </Text>
              <Text style={styles.meHeroDateDay}>{heroDateParts.dayLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {shouldShowShiftName || shouldShowHeroSplitBadge ? (
        <View style={styles.meHeroTitleRow}>
          {shouldShowShiftName ? (
            <Text style={styles.meHeroTitle}>{shiftName}</Text>
          ) : null}
          {shouldShowHeroSplitBadge ? (
            <SplitShiftBadge
              count={splitShiftCount}
              inverse
              label={heroSplitShiftLabel}
            />
          ) : null}
        </View>
      ) : null}
      {focusAreaName ? (
        <View style={styles.meHeroAreaRow}>
          <Ionicons
            color="rgba(255, 255, 255, 0.82)"
            name="location-outline"
            size={18}
          />
          <Text style={styles.meHeroAreaLabel}>{focusAreaName}</Text>
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
      {timeRange ? (
        <View style={styles.meHeroScheduleRow}>
          <View style={styles.meHeroTimeRow}>
            <Ionicons
              color="rgba(255, 255, 255, 0.82)"
              name="time-outline"
              size={24}
            />
            <Text style={styles.meHeroTimeText}>{timeRange}</Text>
          </View>
          {timing ? (
            <Text style={styles.meHeroProgressLabel}>{timing.label}</Text>
          ) : null}
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
      <MeHeroShiftmates entries={shiftmates} />
      {heroSplitSegments.segments.length > 0 ? (
        <SplitShiftSegmentList
          dashedDividers
          inverse
          leadingDivider
          renderSegmentChip={(segment) => (
            <JobPill
              chip={getSegmentJobChip(segment)}
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

  return (
    <View style={styles.meSectionBlock}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [
            styles.meHeroCard,
            pressed && styles.meHeroCardPressed,
          ]}
          testID="me-hero-card"
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.meHeroCard} testID="me-hero-card">
          {cardContent}
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
}: {
  items: Array<NonNullable<FeaturedMeScheduleSegment["item"]>>;
  onPressEntry: (entry: MobileScheduleEntry) => void;
  summary: WeeklyHoursSummary | null;
  todayDate: string;
}) {
  if (items.length === 0) {
    return null;
  }

  const hoursLabel =
    summary && summary.scheduledHours > 0
      ? `${formatHoursValue(summary.scheduledHours)}h this week`
      : null;
  const groupedItems = items.reduce<
    Array<{
      date: string;
      items: Array<NonNullable<FeaturedMeScheduleSegment["item"]>>;
    }>
  >((groups, item) => {
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.date === item.date) {
      currentGroup.items.push(item);
      return groups;
    }

    groups.push({
      date: item.date,
      items: [item],
    });
    return groups;
  }, []);

  return (
    <View style={styles.upcomingSectionBlock}>
      <View style={styles.upcomingSectionHeader}>
        <Text style={styles.upcomingSectionTitle}>My Week</Text>
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
              key={`${group.date}-${groupIndex}`}
              style={[
                styles.upcomingDateGroup,
                groupIndex > 0 && styles.upcomingShiftRowBorder,
                isToday && styles.upcomingShiftRowToday,
                isToday &&
                  groupIndex === 0 &&
                  styles.upcomingShiftRowTodayFirst,
                isToday &&
                  groupIndex === groupedItems.length - 1 &&
                  styles.upcomingShiftRowTodayLast,
              ]}
              testID={isToday ? `upcoming-today-row-${group.date}` : undefined}
            >
              <View style={styles.upcomingDateColumn}>
                <View style={styles.upcomingDateTile}>
                  <Text style={styles.upcomingDateWeekday}>
                    {dateParts.weekdayLabel}
                  </Text>
                  <Text style={styles.upcomingDateDay}>
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
                {group.items.map((item, itemIndex) => {
                  const typeChip = getScheduleItemTypeChip(item);
                  const shiftName = getScheduleItemShiftName(item);
                  const shouldShowShiftName = shouldShowMePrimaryTitle(
                    shiftName,
                    typeChip,
                  );
                  const focusAreaName = getScheduleItemFocusArea(item);
                  const timeRange = getScheduleItemTimeRange(item);
                  const splitSegments = getSplitShiftSegmentsForEntry(
                    item.entry,
                  );
                  const splitShiftLabel = getScheduleItemSplitShiftLabel(item);

                  return (
                    <Fragment key={item.key}>
                      {itemIndex > 0 ? <UpcomingShiftDashedDivider /> : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onPressEntry(item.entry)}
                        style={styles.upcomingShiftRow}
                      >
                        <View style={styles.upcomingShiftCopy}>
                          {shouldShowShiftName || splitSegments.length > 1 ? (
                            <View style={styles.upcomingShiftTitleRow}>
                              <View style={styles.upcomingShiftTitleMeta}>
                                {shouldShowShiftName ? (
                                  <Text style={styles.upcomingShiftTitle}>
                                    {shiftName}
                                  </Text>
                                ) : null}
                                {splitSegments.length > 1 ? (
                                  <SplitShiftBadge
                                    count={splitSegments.length}
                                    compact
                                    label={splitShiftLabel}
                                  />
                                ) : null}
                              </View>
                              {timeRange ? (
                                <View style={styles.upcomingShiftTime}>
                                  <Ionicons
                                    color={mobileColors.textMuted}
                                    name="time-outline"
                                    size={18}
                                  />
                                  <Text style={styles.upcomingShiftTimeText}>
                                    {timeRange}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {focusAreaName ? (
                            <Text style={styles.upcomingShiftArea}>
                              {focusAreaName}
                            </Text>
                          ) : null}
                          <MeTypePill
                            chip={typeChip}
                            compact
                            isMentored={item.segment.isMentored === true}
                          />
                          {timeRange &&
                          !shouldShowShiftName &&
                          splitSegments.length <= 1 ? (
                            <View style={styles.upcomingShiftTime}>
                              <Ionicons
                                color={mobileColors.textMuted}
                                name="time-outline"
                                size={18}
                              />
                              <Text style={styles.upcomingShiftTimeText}>
                                {timeRange}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.upcomingShiftAction}>
                          <Ionicons
                            color={mobileColors.textMuted}
                            name="chevron-forward"
                            size={22}
                          />
                        </View>
                      </Pressable>
                    </Fragment>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function UpcomingShiftDashedDivider() {
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
  isLoading,
  pendingAction,
  now,
  requestsError,
  timeZone,
  onClaim,
  onVolunteer,
  onSeeAll,
}: {
  requests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  scheduleEntries: MobileScheduleEntry[];
  linkedEmployeeId: string | null;
  isLoading: boolean;
  pendingAction: PendingRequestAction;
  now: Date;
  requestsError: unknown;
  timeZone?: string | null;
  onClaim: (requestId: string) => void;
  onVolunteer: (openShift: MobileOpenShift) => void;
  onSeeAll: () => void;
}) {
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {},
  );
  const [stackCardHeights, setStackCardHeights] = useState<
    Record<string, number>
  >({});
  const availableOpenShiftFeed = useMemo(
    () =>
      buildAvailableOpenShiftFeed({
        linkedEmployeeId,
        scheduleEntries,
        openShifts,
        requests,
        now,
        timeZone,
      }),
    [linkedEmployeeId, now, openShifts, requests, scheduleEntries, timeZone],
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
  const toggleExpandedDate = useCallback((date: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDates((currentDates) => ({
      ...currentDates,
      [date]: !currentDates[date],
    }));
  }, []);
  const renderFeedCard = (
    item: AvailableShiftFeedItem,
    options?: {
      accessibilityLabel?: string;
      onToggle?: () => void;
    },
  ) => {
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
        pendingAction?.key ===
          getMobileRequestActionKey(item.openShift.id, volunteerBody);
      const jobChip = getOpenShiftJobChip(item.openShift);
      const isMentored = hasMentoredSegments(
        item.openShift.presentation.segments,
      );
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
              {hasSplitSegments ? (
                <SplitShiftBadge count={splitSegments.length} compact />
              ) : null}
            </View>
          ) : null}
          {hasSplitSegments ? (
            <View style={styles.openShiftSplitPanel}>
              <SplitShiftSegmentList
                renderSegmentChip={(segment) => (
                  <JobPill
                    chip={getSegmentJobChip(segment)}
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
              {focusAreaName ? (
                <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text>
              ) : null}
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
              <Ionicons
                color={mobileColors.textMuted}
                name="time-outline"
                size={18}
              />
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
          ? (item.openShift.volunteerBlockReason ??
            "You can't volunteer for this shift right now.")
          : null;

      return (
        <View key={item.key} style={styles.openShiftCard}>
          {cardSurface}
          {volunteerBlockReason ? (
            <Text style={styles.scheduleRowMeta}>{volunteerBlockReason}</Text>
          ) : null}
          <Button
            disabled={
              Boolean(pendingAction) ||
              !linkedEmployeeId ||
              item.openShift.canVolunteer === false
            }
            label={isVolunteerLoading ? pendingAction.label : "Volunteer"}
            leadingAccessory={
              <Ionicons
                color={mobileColors.brand}
                name="add-circle-outline"
                size={18}
              />
            }
            loading={isVolunteerLoading}
            onPress={() => {
              if (item.openShift.canVolunteer === false) {
                return;
              }
              onVolunteer(item.openShift);
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
      pendingAction?.key ===
        getMobileRequestActionKey(item.request.id, claimBody);
    const jobChip = getRequestJobChip(item.request, "requester");
    const isMentored = hasMentoredSegments(
      getRequestSegments(item.request, "requester"),
    );
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
        {shouldShowShiftName ? (
          <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
        ) : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? (
              <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text>
            ) : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons
              color={mobileColors.textMuted}
              name="time-outline"
              size={18}
            />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </Pressable>
    ) : (
      <View style={styles.openShiftCardSurface}>
        {shouldShowShiftName ? (
          <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
        ) : null}
        {jobChip || focusAreaName || isMentored ? (
          <View style={styles.scheduleRowContextStack}>
            {focusAreaName ? (
              <Text style={styles.scheduleRowMeta}>{focusAreaName}</Text>
            ) : null}
            {jobChip || isMentored ? (
              <View style={styles.scheduleRowContext}>
                <MeTypePill chip={jobChip} compact isMentored={isMentored} />
              </View>
            ) : null}
          </View>
        ) : null}
        {timeRange ? (
          <View style={styles.scheduleRowTime}>
            <Ionicons
              color={mobileColors.textMuted}
              name="time-outline"
              size={18}
            />
            <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
          </View>
        ) : null}
      </View>
    );

    return (
      <View key={item.key} style={styles.openShiftCard}>
        {cardSurface}
        <Button
          disabled={
            isPendingVolunteerRequest ||
            Boolean(pendingAction) ||
            !linkedEmployeeId
          }
          label={
            isPendingVolunteerRequest
              ? "Pending approval"
              : isClaimLoading
                ? pendingAction.label
                : "Claim Shift"
          }
          leadingAccessory={
            <Ionicons
              color={mobileColors.brand}
              name={
                isPendingVolunteerRequest
                  ? "hourglass-outline"
                  : "add-circle-outline"
              }
              size={18}
            />
          }
          loading={isClaimLoading}
          onPress={() => onClaim(item.request.id)}
          tone="secondary"
        />
      </View>
    );
  };

  if (!isLoading && !requestsError && availableOpenShiftFeed.totalCount === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader
        actionLabel="See all"
        onAction={onSeeAll}
        title="Open Shifts"
      />

      {isLoading ? (
        <ListSkeleton rows={2} showSectionHeader={false} />
      ) : requestsError ? (
        <StatusBanner
          body="We couldn't load open shifts right now."
          title="Could not load open shifts"
        />
      ) : (
        <ScrollView
          accessibilityLabel="Open shifts carousel"
          horizontal
          style={styles.openShiftCarousel}
          contentContainerStyle={styles.openShiftCarouselContent}
          showsHorizontalScrollIndicator={false}
        >
          {dateGroups.map((group) => {
            const dateLabel = formatCompactScheduleDate(group.date);
            const isExpandedDay = expandedDates[group.date] === true;
            const isExpandableDay = group.items.length > 1;
            const visibleItems = isExpandedDay
              ? group.items
              : group.items.slice(0, MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS);
            const isCollapsedStack = !isExpandedDay && visibleItems.length > 1;
            const hiddenStackCount = isCollapsedStack
              ? visibleItems.length - 1
              : 0;
            const stackedDeckHeight =
              hiddenStackCount * OPEN_SHIFT_STACK_PEEK_HEIGHT +
              OPEN_SHIFT_CARD_SHADOW_ALLOWANCE;
            const stackCardHeight =
              stackCardHeights[group.date] ?? OPEN_SHIFT_CARD_MIN_HEIGHT;
            const cardToggleLabel = isExpandedDay
              ? `Collapse open shifts for ${dateLabel}`
              : `Expand open shifts for ${dateLabel}`;

            return (
              <View key={group.date} style={styles.openShiftDateCard}>
                <View style={styles.openShiftDateHeader}>
                  <Text style={styles.scheduleRowDate}>{dateLabel}</Text>
                  <View
                    accessibilityLabel={formatOpenShiftCardCountLabel(
                      group.itemCount,
                    )}
                    style={styles.openShiftCountBadge}
                  >
                    <Text style={styles.openShiftCountBadgeText}>
                      {group.itemCount}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.openShiftDateCardItems,
                    isCollapsedStack && styles.openShiftDateCardItemsStacked,
                    isCollapsedStack && {
                      minHeight: stackCardHeight,
                      paddingBottom: stackedDeckHeight,
                    },
                  ]}
                >
                  {isCollapsedStack ? (
                    <>
                      {visibleItems.slice(1).map((item, index) => {
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
                                zIndex: visibleItems.length - stackIndex,
                              },
                            ]}
                          />
                        );
                      })}
                      <View
                        onLayout={(event) => {
                          noteStackCardHeight(
                            group.date,
                            event.nativeEvent.layout.height,
                          );
                        }}
                        style={styles.openShiftCardLead}
                      >
                        {renderFeedCard(
                          visibleItems[0] as AvailableShiftFeedItem,
                          {
                            accessibilityLabel: cardToggleLabel,
                            onToggle: () => toggleExpandedDate(group.date),
                          },
                        )}
                      </View>
                    </>
                  ) : (
                    visibleItems.map((item, index) =>
                      renderFeedCard(
                        item,
                        isExpandableDay && index === 0
                          ? {
                              accessibilityLabel: cardToggleLabel,
                              onToggle: () => toggleExpandedDate(group.date),
                            }
                          : undefined,
                      ),
                    )
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function ShiftCoverRequestsSection({
  requests,
  linkedEmployeeId,
  isLoading,
  pendingAction,
  requestsError,
  onRespond,
}: {
  requests: MobileShiftRequest[];
  linkedEmployeeId: string | null;
  isLoading: boolean;
  pendingAction: PendingRequestAction;
  requestsError: unknown;
  onRespond: (requestId: string, accept: boolean) => void;
}) {
  if (!isLoading && !requestsError && requests.length === 0) {
    return null;
  }

  return (
    <View style={styles.meSectionBlock}>
      <MeSectionHeader title="Needs Your Response" />

      {isLoading ? (
        <ListSkeleton rows={2} showSectionHeader={false} />
      ) : requestsError ? (
        <StatusBanner
          body="We couldn't load cover requests right now."
          title="Could not load requests"
        />
      ) : (
        <View style={styles.requestList}>
          {requests.map((request) => {
            const avatarTone = getAvatarTone(request.requesterEmpId);
            const jobChip = getRequestJobChip(request, "requester");
            const shiftName = getRequestShiftName(request, "requester");
            const shouldShowShiftName = shouldShowMePrimaryTitle(
              shiftName,
              jobChip,
            );
            const focusAreaName = getRequestFocusAreaName(request, "requester");
            const isMentored = hasMentoredSegments(
              getRequestSegments(request, "requester"),
            );
            const timeRange = getRequestTimeRange(request, "requester");
            const acceptBody: RequestActionBody | null = linkedEmployeeId
              ? { action: "respond", empId: linkedEmployeeId, accept: true }
              : null;
            const declineBody: RequestActionBody | null = linkedEmployeeId
              ? { action: "respond", empId: linkedEmployeeId, accept: false }
              : null;
            const isAcceptLoading =
              acceptBody != null &&
              pendingAction?.key ===
                getMobileRequestActionKey(request.id, acceptBody);
            const isDeclineLoading =
              declineBody != null &&
              pendingAction?.key ===
                getMobileRequestActionKey(request.id, declineBody);

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
                        style={[
                          styles.requestAvatarText,
                          { color: avatarTone.textColor },
                        ]}
                      >
                        {getInitials(request.requesterName)}
                      </Text>
                    </View>
                    <View style={styles.requestHeaderTextStack}>
                      <Text style={styles.requestHeaderText}>
                        {request.requesterName}
                      </Text>
                      <Text style={styles.requestHeaderSubtext}>
                        Needs shift coverage
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestDateText}>
                    {getRequestDateLabel(request)}
                  </Text>
                </View>

                {shouldShowShiftName ? (
                  <Text style={styles.scheduleRowTitle}>{shiftName}</Text>
                ) : null}
                {jobChip || focusAreaName || isMentored ? (
                  <View style={styles.scheduleRowContext}>
                    <MeTypePill
                      chip={jobChip}
                      compact
                      isMentored={isMentored}
                    />
                    {focusAreaName ? (
                      <Text style={styles.scheduleRowMeta}>
                        {focusAreaName}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {timeRange ? (
                  <View style={styles.scheduleRowTime}>
                    <Ionicons
                      color={mobileColors.textMuted}
                      name="time-outline"
                      size={18}
                    />
                    <Text style={styles.scheduleRowTimeText}>{timeRange}</Text>
                  </View>
                ) : null}

                <View style={styles.requestActions}>
                  <Button
                    disabled={Boolean(pendingAction) || !linkedEmployeeId}
                    label={isAcceptLoading ? pendingAction.label : "Accept"}
                    loading={isAcceptLoading}
                    onPress={() => onRespond(request.id, true)}
                  />
                  <Button
                    disabled={Boolean(pendingAction) || !linkedEmployeeId}
                    label={isDeclineLoading ? pendingAction.label : "Decline"}
                    loading={isDeclineLoading}
                    onPress={() => onRespond(request.id, false)}
                    tone="neutral"
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
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
  const { entry, segment } = row;
  const avatarTone = getAvatarTone(entry.employeeId);
  const memberName =
    entry.employeeId === linkedEmployeeId ? "Me" : entry.employeeName;
  const memberTimeRange = getTeamShiftRowTimeRange(row, groupTimeRange);
  const alternateShiftLabel = formatAlternateShiftTitles(
    row.alternateShiftTitles,
  );
  const roleChip = getTeamMemberRoleChip(entry, segment);
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
          style={[styles.teamMemberAvatarText, { color: avatarTone.textColor }]}
        >
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.teamMemberMain}>
        <View style={styles.teamMemberCopy}>
          <View style={styles.teamMemberNameRow}>
            <Text style={styles.teamMemberName}>{memberName}</Text>
          </View>
          {memberTimeRange ? (
            <Text style={styles.teamMemberTime}>{memberTimeRange}</Text>
          ) : null}
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
            <JobPill
              chip={roleChip}
              compact
              eyebrowDisplay="outside"
              isMentored={isMentored}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function getTeamMemberRoleChip(
  entry: MobileScheduleEntry,
  segment?: MobileScheduleEntrySegment | null,
): JobChip | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return buildAbsenceChip(getScheduleEntryTitle(entry), entry.presentation);
  }

  if (segment) {
    return getSegmentJobChip(segment);
  }

  const primarySegment = getScheduleEntrySegments(entry)[0] ?? null;
  if (isGeneralShiftSegment(primarySegment)) {
    return buildGeneralShiftChip(getScheduleEntryTitle(entry), primarySegment);
  }

  const jobSegment =
    getScheduleEntrySegments(entry).find((item) => item.jobName) ?? null;
  return buildJobChip(jobSegment?.jobName ?? null, jobSegment);
}

function getInitials(name: string): string {
  const parts =
    name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last =
    parts.length > 1
      ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "")
      : "";

  return `${first}${last}` || "?";
}

function hashCode(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}

function getAvatarTone(seed: string): AvatarTone {
  const hue = hashCode(seed) % 360;

  return {
    backgroundColor: `hsl(${hue}, 70%, 92%)`,
    borderColor: `hsl(${hue}, 70%, 85%)`,
    textColor: `hsl(${hue}, 70%, 35%)`,
  };
}

const styles = StyleSheet.create({
  loadingState: {
    gap: 14,
  },
  loadingTitle: {
    ...mobileText.screenTitle,
    color: mobileColors.textPrimary,
  },
  loadingBody: {
    ...mobileText.body,
    color: mobileColors.textMuted,
  },
  stickyControlsSection: {
    gap: 16,
  },
  scheduleCalendarStickyHeaderShell: {
    backgroundColor: mobileColors.borderSubtle,
    borderBottomWidth: 0.5,
    borderBottomColor: mobileColors.border,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  mePage: {
    gap: 22,
    paddingTop: 8,
  },
  mePageEmpty: {
    justifyContent: "center",
    paddingTop: 0,
  },
  meTopStack: {
    gap: 18,
  },
  meWelcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  meWelcomeCopy: {
    flex: 1,
    gap: 4,
  },
  meWelcomeDate: {
    ...mobileText.bodyStrong,
    color: mobileColors.textSubtle,
  },
  meWelcomeTitle: {
    ...mobileText.sectionTitle,
    fontSize: 20,
    lineHeight: 25,
    color: mobileColors.textPrimary,
  },
  meWeekNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 2,
  },
  meWeekNavigatorCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  meWeekNavigatorTitle: {
    ...mobileText.sectionTitle,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: mobileColors.textPrimary,
  },
  meWeekNavigatorRangeLabel: {
    ...mobileText.bodyStrong,
    color: mobileColors.textSecondary,
  },
  meWeekNavigatorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  meWeekRangeControlGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
  },
  meTodayButton: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    backgroundColor: mobileColors.brandSoft,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  meTodayButtonPressed: {
    opacity: 0.82,
  },
  meTodayButtonText: {
    ...mobileText.meta,
    color: mobileColors.brand,
    fontWeight: "600",
  },
  meHeroCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: ME_HERO_CARD_BACKGROUND,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: "rgba(37, 99, 235, 0.3)",
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 5,
  },
  meHeroCardMuted: {
    backgroundColor: "#E2E8F0",
    shadowColor: mobileColors.shadow,
  },
  meHeroCardPressed: {
    opacity: 0.94,
  },
  meHeroGlow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  meHeroGlowLarge: {
    width: 180,
    height: 180,
    top: -72,
    right: -58,
  },
  meHeroGlowSmall: {
    width: 140,
    height: 140,
    bottom: -64,
    left: -24,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
  },
  meHeroGlowMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  meHeroContent: {
    gap: 11,
  },
  meHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  meHeroHeaderCopy: {
    flex: 1,
    gap: 10,
  },
  meHeroStatusStack: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  meHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  meHeroBadgeMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  meHeroBadgeDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  meHeroBadgeDotActive: {
    backgroundColor: "#86EFAC",
  },
  meHeroBadgeDotScheduled: {
    backgroundColor: "#BFDBFE",
  },
  meHeroBadgeDotMuted: {
    backgroundColor: mobileColors.textMuted,
  },
  meHeroBadgeText: {
    ...mobileText.label,
    color: mobileColors.textInverse,
    textTransform: "uppercase",
  },
  meHeroBadgeTextMuted: {
    color: mobileColors.textPrimary,
  },
  meHeroDateTile: {
    minWidth: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  meHeroDateWeekday: {
    ...mobileText.label,
    color: "rgba(255, 255, 255, 0.72)",
  },
  meHeroDateDay: {
    ...mobileText.heroMetric,
    color: mobileColors.textInverse,
  },
  meHeroDateText: {
    ...mobileText.meta,
    alignSelf: "flex-start",
    color: "rgba(255, 255, 255, 0.86)",
    fontWeight: "600",
  },
  meHeroTitle: {
    flexShrink: 1,
    minWidth: 0,
    ...mobileText.heroMetric,
    color: mobileColors.textInverse,
  },
  meHeroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  meHeroHeading: {
    ...mobileText.rowTitle,
    color: mobileColors.textInverse,
  },
  meHeroHeadingMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroTitleMuted: {
    color: mobileColors.textPrimary,
  },
  meHeroSupportingText: {
    ...mobileText.body,
    color: "rgba(255, 255, 255, 0.84)",
    fontWeight: "500",
  },
  meHeroSupportingTextMuted: {
    color: mobileColors.textMuted,
  },
  meHeroAreaLabel: {
    ...mobileText.rowTitle,
    color: "rgba(255, 255, 255, 0.86)",
  },
  meHeroAreaLabelMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  meHeroAreaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  meHeroRoleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  meTypePillStack: {
    alignSelf: "flex-start",
    gap: 4,
  },
  meTypePillLabel: {
    ...mobileText.rowTitle,
    color: mobileColors.textMuted,
  },
  meTypePillLabelRow: {
    fontSize: 17,
    lineHeight: 22,
  },
  meTypePillLabelHero: {
    fontSize: 24,
    lineHeight: 30,
  },
  meTypePillLabelInverse: {
    color: "rgba(255, 255, 255, 0.82)",
  },
  meHeroScheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  meHeroTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 9,
    minWidth: 0,
  },
  meHeroTimeText: {
    ...mobileText.sectionTitle,
    color: mobileColors.textInverse,
    flexShrink: 1,
  },
  meHeroTimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    backgroundColor: "rgba(29, 78, 216, 0.22)",
    borderRadius: mobileRadii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  meHeroTimePillMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.58)",
  },
  meHeroTimePillText: {
    ...mobileText.bodyStrong,
    color: mobileColors.textInverse,
  },
  meHeroTimePillTextMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  meHeroActionIconMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  meHeroEmptyText: {
    ...mobileText.body,
    color: "rgba(255, 255, 255, 0.84)",
    fontWeight: "500",
  },
  meHeroEmptyBlock: {
    gap: 10,
  },
  meHeroEmptyTextMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroDetails: {
    gap: 8,
  },
  meHeroDetailText: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  meHeroDetailTextMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroProgressBlock: {
    gap: 10,
    marginTop: 4,
  },
  meHeroProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  meHeroProgressLabel: {
    ...mobileText.rowTitle,
    color: "rgba(255, 255, 255, 0.86)",
    flexShrink: 0,
  },
  meHeroProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.24)",
    overflow: "hidden",
  },
  meHeroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#42E878",
  },
  meHeroCollaborators: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: ME_HERO_COLLABORATOR_BACKGROUND,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 6,
  },
  meHeroCollaboratorLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  meHeroCollaboratorLabel: {
    ...mobileText.rowTitle,
    color: "rgba(255, 255, 255, 0.84)",
    flexShrink: 1,
  },
  meHeroAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  meHeroCollaboratorAvatarFrame: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: ME_HERO_COLLABORATOR_BACKGROUND,
    padding: 2,
  },
  meHeroCollaboratorAvatarFrameOverlap: {
    marginLeft: ME_HERO_AVATAR_FRAME_OVERLAP,
  },
  meHeroCollaboratorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#2946C7",
    alignItems: "center",
    justifyContent: "center",
  },
  meHeroCollaboratorAvatarText: {
    ...mobileText.meta,
    fontWeight: "600",
  },
  meHeroCollaboratorOverflow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  meHeroCollaboratorOverflowText: {
    ...mobileText.bodyStrong,
    color: "#1D4ED8",
  },
  meSectionBlock: {
    gap: 12,
  },
  upcomingSectionBlock: {
    gap: 18,
  },
  upcomingSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  upcomingSectionTitle: {
    ...mobileText.sectionTitle,
    fontSize: 18,
    lineHeight: 24,
    flex: 1,
    color: mobileColors.textPrimary,
  },
  upcomingHoursBadge: {
    borderRadius: 12,
    backgroundColor: mobileColors.brandSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  upcomingHoursBadgeText: {
    ...mobileText.bodyStrong,
    color: mobileColors.brand,
  },
  upcomingShiftsCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 20,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 3,
  },
  upcomingDateGroup: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 18,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  upcomingDateColumn: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  upcomingDateShiftStack: {
    flex: 1,
    minWidth: 0,
  },
  upcomingShiftRow: {
    minHeight: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingVertical: 18,
  },
  upcomingShiftRowBorder: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  upcomingShiftDashedDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  upcomingShiftDashedDividerSegment: {
    flex: 1,
    height: 1,
    borderRadius: 999,
    backgroundColor: mobileColors.border,
  },
  upcomingShiftRowToday: {
    backgroundColor: mobileColors.brandSoft,
  },
  upcomingShiftRowTodayFirst: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  upcomingShiftRowTodayLast: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  upcomingDateTile: {
    width: 60,
    height: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  upcomingDateWeekday: {
    ...mobileText.micro,
    color: mobileColors.textSubtle,
    fontSize: 11,
  },
  upcomingDateDay: {
    ...mobileText.sectionTitle,
    fontSize: 20,
    lineHeight: 24,
    color: mobileColors.textSecondary,
  },
  upcomingDateTodayDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: mobileColors.danger,
    marginTop: 1,
  },
  upcomingShiftCopy: {
    flex: 1,
    minWidth: 0,
    gap: 9,
  },
  upcomingShiftTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  upcomingShiftTitleMeta: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  upcomingShiftTitle: {
    flexShrink: 1,
    minWidth: 0,
    ...mobileText.sectionTitle,
    fontSize: 17,
    color: mobileColors.textPrimary,
  },
  upcomingShiftArea: {
    ...mobileText.rowTitle,
    color: mobileColors.textSecondary,
  },
  upcomingShiftTime: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  upcomingShiftTimeText: {
    ...mobileText.bodyStrong,
    color: mobileColors.textSubtle,
  },
  upcomingShiftAction: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  meSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  meSectionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  meSectionTitle: {
    ...mobileText.sectionTitle,
    fontSize: 18,
    color: mobileColors.textPrimary,
  },
  meSectionLink: {
    ...mobileText.bodyStrong,
    color: mobileColors.brand,
  },
  meSurfaceCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 18,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  meSectionBody: {
    ...mobileText.body,
    color: mobileColors.textMuted,
    fontWeight: "500",
  },
  scheduleListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
  },
  scheduleListRowBorder: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  scheduleListCopy: {
    flex: 1,
    gap: 8,
  },
  scheduleRowDate: {
    ...mobileText.bodyStrong,
    color: mobileColors.textMuted,
  },
  scheduleRowTitle: {
    ...mobileText.sectionTitle,
    fontSize: 17,
    color: mobileColors.textPrimary,
  },
  scheduleRowTitleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scheduleRowMeta: {
    ...mobileText.rowTitle,
    color: mobileColors.textSecondary,
  },
  scheduleRowContext: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scheduleRowContextStack: {
    gap: 8,
  },
  scheduleRowTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scheduleRowTimeText: {
    ...mobileText.rowTitle,
    color: mobileColors.textMuted,
    fontWeight: "500",
  },
  scheduleRowArrow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  openShiftCarousel: {
    marginHorizontal: -OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
  },
  openShiftCarouselContent: {
    gap: 14,
    paddingHorizontal: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
    paddingTop: 4,
    paddingBottom: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
    paddingRight: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE + 4,
  },
  openShiftDateCard: {
    width: 320,
    gap: 12,
  },
  openShiftDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  openShiftDateCardItems: {
    gap: 14,
    paddingBottom: OPEN_SHIFT_CARD_SHADOW_ALLOWANCE,
  },
  openShiftDateCardItemsStacked: {
    gap: 0,
    minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
    position: "relative",
  },
  openShiftCountBadge: {
    minWidth: 28,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    backgroundColor: mobileColors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  openShiftCountBadgeText: {
    ...mobileText.badge,
    color: mobileColors.brand,
  },
  openShiftCard: {
    minHeight: OPEN_SHIFT_CARD_MIN_HEIGHT,
    gap: 12,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 18,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  openShiftCardSurface: {
    gap: 12,
  },
  openShiftSplitPanel: {
    gap: 10,
  },
  openShiftCardLead: {
    zIndex: MAX_VISIBLE_OPEN_SHIFT_STACK_CARDS + 1,
  },
  openShiftCardStacked: {
    position: "absolute",
    shadowRadius: 14,
  },
  requestList: {
    gap: 14,
  },
  requestCard: {
    gap: 14,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 18,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  requestHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  requestHeaderCopy: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  requestAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  requestAvatarText: {
    ...mobileText.bodyStrong,
  },
  requestHeaderText: {
    ...mobileText.rowTitle,
    color: mobileColors.textPrimary,
  },
  requestHeaderTextStack: {
    flex: 1,
    gap: 2,
  },
  requestHeaderSubtext: {
    ...mobileText.meta,
    color: mobileColors.textSecondary,
    fontWeight: "600",
  },
  requestDateText: {
    ...mobileText.bodyStrong,
    color: mobileColors.textMuted,
  },
  requestActions: {
    flexDirection: "row",
    gap: 12,
  },
  jobPill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  jobPillCompact: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  jobPillTextStack: {
    gap: 2,
  },
  jobPillInlineTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  jobPillEyebrowText: {
    ...mobileText.micro,
  },
  jobPillEyebrowTextCompact: {
    fontSize: 9,
  },
  jobPillText: {
    ...mobileText.badge,
    textTransform: "uppercase",
  },
  jobPillMentoredText: {
    textTransform: "none",
  },
  jobPillTextCompact: {
    fontSize: 12,
  },
  jobPillValueText: {
    ...mobileText.meta,
    fontWeight: "600",
  },
  jobPillValueTextCompact: {
    fontSize: 12,
  },
  mentoredPill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surfaceSecondary,
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mentoredPillText: {
    ...mobileText.badge,
    color: mobileColors.textSecondary,
  },
  meCollaboratorList: {
    gap: 0,
  },
  meCollaboratorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  meCollaboratorRowBorder: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  meCollaboratorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  meCollaboratorAvatarText: {
    ...mobileText.meta,
    color: mobileColors.brand,
    fontWeight: "600",
  },
  meCollaboratorCopy: {
    flex: 1,
    gap: 8,
  },
  meCollaboratorName: {
    ...mobileText.bodyStrong,
    color: mobileColors.textPrimary,
  },
  timelineList: {
    gap: 18,
  },
  timelineSection: {
    gap: 12,
    paddingLeft: 18,
    marginLeft: 4,
    borderLeftWidth: 2,
    borderLeftColor: mobileColors.borderSubtle,
  },
  timelineSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: -25,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: mobileColors.background,
    backgroundColor: mobileColors.brand,
  },
  timelineSectionTitle: {
    ...mobileText.rowTitle,
    color: mobileColors.textPrimary,
  },
  timelineSectionEntries: {
    gap: 10,
  },
  timelineEntryCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 2,
  },
  timelineEntryCardPressed: {
    opacity: 0.92,
  },
  meHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  meHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamHeaderUtilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    justifyContent: "space-between",
  },
  teamHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: "auto",
    flexShrink: 0,
    overflow: "visible",
  },
  teamHeaderTitleArea: {
    flex: 1,
    minWidth: 0,
  },
  meSelectedDateTitle: {
    ...mobileText.sectionTitle,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    flex: 1,
    color: mobileColors.textPrimary,
    textAlign: "left",
  },
  teamHeaderTitle: {
    ...mobileText.sectionTitle,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: mobileColors.textPrimary,
    textAlign: "left",
    flexShrink: 1,
    minWidth: 0,
  },
  focusAreaPillList: {
    marginHorizontal: -mobileSpacing.screenX,
  },
  focusAreaPillListContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: mobileSpacing.screenX,
    paddingVertical: 2,
  },
  focusAreaPill: {
    minHeight: 36,
    maxWidth: 180,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  focusAreaPillActive: {
    borderColor: mobileColors.brand,
    backgroundColor: mobileColors.brand,
  },
  focusAreaPillPressed: {
    opacity: 0.62,
  },
  focusAreaPillText: {
    color: mobileColors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  focusAreaPillTextActive: {
    color: mobileColors.textInverse,
  },
  iconControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 2,
  },
  iconControlButtonPressed: {
    opacity: 0.82,
  },
  weekStripFrame: {
    minHeight: 72,
    overflow: "hidden",
  },
  weekStripTrack: {
    flexDirection: "row",
    minHeight: 72,
  },
  weekStrip: {
    flexDirection: "row",
    gap: 4,
  },
  dayChip: {
    flex: 1,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipBody: {
    minWidth: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  dayChipBodySelected: {
    backgroundColor: mobileColors.surface,
    borderColor: mobileColors.borderSubtle,
  },
  dayChipBodyToday: {
    backgroundColor: mobileColors.danger,
    borderColor: mobileColors.danger,
  },
  dayChipWeekday: {
    ...mobileText.label,
    color: mobileColors.textSubtle,
  },
  dayChipWeekdaySelected: {
    color: mobileColors.textPrimary,
  },
  dayChipWeekdayToday: {
    color: mobileColors.danger,
  },
  dayChipWeekdayTodaySelected: {
    color: mobileColors.textInverse,
  },
  dayChipDay: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  dayChipDaySelected: {
    color: mobileColors.textPrimary,
  },
  dayChipDayToday: {
    color: mobileColors.danger,
  },
  dayChipDayTodaySelected: {
    color: mobileColors.textInverse,
  },
  monthCalendar: {
    padding: 16,
    gap: 14,
  },
  monthCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 6,
  },
  monthCalendarTitle: {
    ...mobileText.sectionTitle,
    flex: 1,
    color: mobileColors.textPrimary,
    textAlign: "center",
  },
  monthCalendarWeekdays: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 6,
  },
  monthCalendarWeekdayLabel: {
    flex: 1,
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  monthCalendarWeeks: {
    gap: 6,
  },
  monthCalendarWeek: {
    flexDirection: "row",
    gap: 6,
  },
  monthCalendarDay: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: mobileRadii.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  monthCalendarDaySelected: {
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  monthCalendarDayToday: {
    backgroundColor: mobileColors.brandSoft,
    borderColor: mobileColors.brandBorder,
  },
  monthCalendarDayText: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  monthCalendarDayTextOutsideMonth: {
    color: mobileColors.textSubtle,
  },
  monthCalendarDayTextSelected: {
    color: mobileColors.textInverse,
  },
  calendarMenuAnchor: {
    position: "relative",
    zIndex: 10,
  },
  popupOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  popupDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  monthCalendarPopupSurface: {
    width: 320,
  },
  alertBadge: {
    position: "absolute",
    top: 3,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileColors.danger,
  },
  alertBadgeText: {
    color: mobileColors.textInverse,
    fontSize: 10,
    fontWeight: "700",
  },
  groupsList: {
    gap: mobileSpacing.sectionGap,
  },
  shiftGroupsList: {
    gap: 28,
    paddingTop: 24,
  },
  shiftGroupBlock: {
    gap: 12,
  },
  shiftGroupDivider: {
    height: 1,
    backgroundColor: mobileColors.borderSubtle,
  },
  shiftGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 8,
  },
  shiftGroupTitle: {
    flex: 1,
    minWidth: 0,
    ...mobileText.sectionTitle,
    fontSize: 18,
    lineHeight: 23,
    color: mobileColors.textPrimary,
  },
  shiftGroupTime: {
    flexShrink: 0,
    ...mobileText.bodyStrong,
    color: mobileColors.textSubtle,
    textAlign: "right",
  },
  weekDaySection: {
    gap: 12,
  },
  weekDayHeader: {
    gap: 4,
  },
  weekDayTitle: {
    ...mobileText.sectionTitle,
    fontSize: 17,
    color: mobileColors.textPrimary,
  },
  weekDayEmptyState: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  weekDayEmptyText: {
    ...mobileText.body,
    color: mobileColors.textMuted,
    fontWeight: "600",
  },
  groupEntries: {
    gap: 10,
  },
  teamGroupCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: mobileColors.shadowStrong,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 2,
  },
  teamGroupMembers: {
    marginTop: 0,
  },
  teamMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 72,
    paddingVertical: 16,
  },
  teamMemberRowBorder: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  teamMemberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  teamMemberAvatarText: {
    ...mobileText.bodyStrong,
    color: mobileColors.brand,
  },
  teamMemberMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teamMemberCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  teamMemberNameRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  teamMemberName: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  teamMemberTime: {
    ...mobileText.bodyStrong,
    color: mobileColors.textSubtle,
  },
  teamMemberSplitBadgeRow: {
    alignItems: "flex-start",
  },
  teamMemberRoleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  teamMemberRoleChip: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  teamMemberRoleChipTextStack: {
    gap: 2,
  },
  teamMemberRoleChipEyebrowText: {
    ...mobileText.micro,
  },
  teamMemberRoleChipText: {
    ...mobileText.badge,
    textTransform: "uppercase",
  },
  teamMemberRoleChipValueText: {
    ...mobileText.caption,
    fontWeight: "600",
  },
  compactSegmentList: {
    gap: 8,
  },
  compactSegmentBlock: {
    gap: 3,
  },
  compactSegmentDivider: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
    paddingTop: 8,
  },
  compactSegmentTitle: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  compactSegmentMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  heroSegmentList: {
    gap: 12,
  },
  heroSegmentBlock: {
    gap: 6,
  },
  heroSegmentDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.18)",
    paddingTop: 12,
  },
  heroSegmentTitle: {
    ...mobileText.sectionTitle,
    color: mobileColors.textInverse,
  },
  heroSegmentMeta: {
    ...mobileText.body,
    color: "rgba(255, 255, 255, 0.84)",
    fontWeight: "500",
  },
  timelineSegmentList: {
    gap: 12,
  },
  timelineSegmentBlock: {
    gap: 4,
  },
  timelineSegmentDivider: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
    paddingTop: 12,
  },
  timelineSegmentTitle: {
    ...mobileText.rowTitle,
    color: mobileColors.textPrimary,
  },
  timelineSegmentMeta: {
    ...mobileText.meta,
    color: mobileColors.textMuted,
    fontWeight: "500",
  },
  entryCard: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 12,
  },
  entrySegmentList: {
    gap: 12,
  },
  entrySegmentBlock: {
    gap: 6,
  },
  entrySegmentDivider: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
    paddingTop: 12,
  },
  entryTitle: {
    ...mobileText.sectionTitle,
    color: mobileColors.textPrimary,
  },
  entryMetaText: {
    ...mobileText.meta,
    color: mobileColors.textMuted,
    fontWeight: "500",
  },
});

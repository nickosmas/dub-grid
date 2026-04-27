import {
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Button } from "../../../shared/components/Button";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import {
  Card,
  Screen,
  type ScreenScrollHandle,
} from "../../../shared/components/Screen";
import {
  getMySchedule,
  getOrgSchedule,
  getShiftRequests,
  updateShiftRequest,
} from "../../../shared/lib/api";
import { getMobileQueryContentState } from "../../../shared/lib/query-state";
import {
  mobileColors,
  mobileRadii,
  mobileSpacing,
} from "../../../shared/theme/tokens";
import { useAccessToken } from "../../auth/hooks/useAccessToken";
import { useBootstrap } from "../../auth/hooks/useBootstrap";
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  buildMeShiftRequestSections,
  buildScheduleMonthDays,
  buildScheduleShiftGroups,
  buildScheduleWeekDays,
  buildUpcomingMeScheduleItems,
  buildWeeklyHoursSummary,
  buildTeamScheduleFocusAreaTabs,
  filterScheduleEntriesByDate,
  filterTeamScheduleEntriesByFocusArea,
  formatScheduleDayLabel,
  formatScheduleMonthLabel,
  formatScheduleRange,
  formatScheduleTimeRange,
  getFeaturedMeScheduleSegment,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCategoryKey,
  getScheduleEntryCustomTimeRange,
  getScheduleEntryCustomStartTime,
  getScheduleEntryEndTime,
  getScheduleEntryFocusAreaId,
  getScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryMemberTimeRange,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
  getScheduleMonthStartDate,
  getScheduleRangeForDate,
  getScheduleShiftGroupTimeRange,
  getIsoDateInTimeZone,
  sortScheduleEntries,
  type FeaturedMeScheduleSegment,
  type MobileScheduleMonthDay,
  type MobileScheduleWeekDay,
  type WeeklyHoursSummary,
} from "../lib/schedule";
import type {
  MobileOpenShift,
  MobileScheduleEntry,
  MobileShiftRequest,
} from "@dubgrid/contracts";

const SWIPE_THRESHOLD = 40;
const MINUTE_IN_MS = 60 * 1000;
const SCHEDULE_CONTENT_REFRESH_INTERVAL_MS = 15 * 1000;
const MONTH_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ME_HERO_CARD_BACKGROUND = "#2946C7";
const ME_HERO_COLLABORATOR_BACKGROUND = "#3A55CB";

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

function getMillisecondsUntilNextMinute(value: Date): number {
  const millisecondsIntoMinute =
    value.getSeconds() * 1000 + value.getMilliseconds();

  return millisecondsIntoMinute === 0
    ? MINUTE_IN_MS
    : MINUTE_IN_MS - millisecondsIntoMinute;
}

function useRealtimeNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function clearScheduledTick() {
      if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
      }
    }

    function scheduleNextTick() {
      clearScheduledTick();
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, getMillisecondsUntilNextMinute(new Date()));
    }

    function syncNow() {
      setNow(new Date());
      scheduleNextTick();
    }

    scheduleNextTick();

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          syncNow();
        }
      },
    );

    return () => {
      clearScheduledTick();
      subscription.remove();
    };
  }, []);

  return now;
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

function formatDurationLabel(totalMinutes: number): string {
  const minutes = Math.max(totalMinutes, 0);
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;

  if (hoursPart === 0) {
    return `${minutesPart}m left`;
  }

  if (minutesPart === 0) {
    return `${hoursPart}h left`;
  }

  return `${hoursPart}h ${minutesPart}m left`;
}

function getHeroProgress(
  entry: MobileScheduleEntry | null,
  segmentStartTime: string | null,
  segmentEndTime: string | null,
  status: "active" | "upcoming" | "scheduled" | "away" | "empty",
  currentTime: string,
): { progress: number; remainingLabel: string } | null {
  if (!entry || status !== "active" || !segmentStartTime || !segmentEndTime) {
    return null;
  }

  const [normalizedRange] = expandTimeRange({
    start: segmentStartTime,
    end: segmentEndTime,
  });
  const currentMinutes = getMinutesSinceMidnight(currentTime);

  if (!normalizedRange || currentMinutes == null) {
    return null;
  }

  const totalMinutes = normalizedRange.end - normalizedRange.start;
  const elapsedMinutes = Math.min(
    Math.max(currentMinutes - normalizedRange.start, 0),
    totalMinutes,
  );

  if (totalMinutes <= 0) {
    return null;
  }

  return {
    progress: elapsedMinutes / totalMinutes,
    remainingLabel: formatDurationLabel(normalizedRange.end - currentMinutes),
  };
}

function formatCompactScheduleDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function getCompactScheduleDateParts(value: string): {
  weekdayLabel: string;
  dayLabel: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${value}T00:00:00.000Z`));

  return {
    weekdayLabel: (
      parts.find((part) => part.type === "weekday")?.value ?? ""
    ).toUpperCase(),
    dayLabel: parts.find((part) => part.type === "day")?.value ?? "",
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
  const primarySegment = getRequestPrimarySegment(request, which);

  if (primarySegment?.shiftName) {
    return primarySegment.shiftName;
  }

  return which === "requester"
    ? (request.requesterPresentation?.label ?? "Shift")
    : (request.targetPresentation?.label ?? "Shift");
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

  return which === "requester"
    ? formatScheduleTimeRange(
        request.requesterState?.customStartTime ?? null,
        request.requesterState?.customEndTime ?? null,
      )
    : formatScheduleTimeRange(
        request.targetState?.customStartTime ?? null,
        request.targetState?.customEndTime ?? null,
      );
}

function getOpenShiftPrimarySegment(openShift: MobileOpenShift) {
  return openShift.presentation.segments[0] ?? null;
}

function getOpenShiftShiftName(openShift: MobileOpenShift): string {
  return (
    getOpenShiftPrimarySegment(openShift)?.shiftName ??
    openShift.presentation.label ??
    "Open Shift"
  );
}

function getOpenShiftJobChip(openShift: MobileOpenShift): JobChip | null {
  const segment = openShift.presentation.segments.find((item) => item.jobName);

  return buildJobChip(segment?.jobName ?? null, segment ?? null);
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
  const segment = openShift.presentation.segments.find(
    (item) => item.startTime && item.endTime,
  );

  if (segment?.startTime && segment.endTime) {
    return formatScheduleTimeRange(segment.startTime, segment.endTime);
  }

  if (openShift.presentation.startTime && openShift.presentation.endTime) {
    return formatScheduleTimeRange(
      openShift.presentation.startTime,
      openShift.presentation.endTime,
    );
  }

  return null;
}

export function ScheduleScreen({ scope }: { scope: ScheduleScope }) {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const bootstrapQuery = useBootstrap(accessToken);
  const now = useRealtimeNow();
  const [selectedTeamFocusAreaKey, setSelectedTeamFocusAreaKey] = useState<
    string | null
  >(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [selectedDateOverride, setSelectedDateOverride] = useState<
    string | null
  >(null);
  const [calendarMonthAnchor, setCalendarMonthAnchor] = useState<string | null>(
    null,
  );
  const meScrollViewRef = useRef<ScreenScrollHandle | null>(null);
  const pendingMeScrollKeyRef = useRef<string | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const timeZone = bootstrapQuery.data?.currentOrg.timezone;
  const todayDate = getIsoDateInTimeZone(now, timeZone);
  const selectedDate = selectedDateOverride ?? todayDate;
  const range = useMemo(
    () => getScheduleRangeForDate(selectedDate),
    [selectedDate],
  );
  const canViewTeamSchedule = bootstrapQuery.data
    ? bootstrapQuery.data.effectiveRole !== "user" ||
      bootstrapQuery.data.permissions.canApproveShiftRequests ||
      bootstrapQuery.data.permissions.canManageEmployees
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
    refetchBootstrap,
    refetchMeTeamSchedule,
    refetchRequests,
    refetchSchedule,
  ]);
  const requestActionMutation = useMutation({
    mutationFn: async (input: { requestId: string; body: RequestActionBody }) =>
      updateShiftRequest(accessToken!, input.requestId, input.body),
    onSuccess: async () => {
      await Promise.all([
        refetchScreenContent(),
        queryClient.invalidateQueries({
          queryKey: ["mobile", "requests", accessToken],
        }),
      ]);
    },
  });

  const activeData = scheduleQuery.data;
  const scheduleEntries = activeData?.entries ?? [];
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const focusAreaLabel =
    bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Area";
  const unreadNotificationCount =
    bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const selectedDateLabel = formatScheduleDayLabel(selectedDate, now, timeZone);
  const isSelectedToday = selectedDate === todayDate;
  const weekRangeLabel = formatScheduleRange(range, timeZone);
  const currentTimeValue = getCurrentTimeValue(now, timeZone);
  const visibleCalendarMonth =
    calendarMonthAnchor ?? getScheduleMonthStartDate(selectedDate);
  const monthCalendarLabel = formatScheduleMonthLabel(
    visibleCalendarMonth,
    timeZone,
  );
  const weekDays = useMemo(
    () => buildScheduleWeekDays(range, selectedDate, timeZone),
    [range, selectedDate, timeZone],
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
  const activeTeamFocusAreaLabel =
    activeTeamFocusAreaTab?.label ?? focusAreaLabel;

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
  const meHeroProgress = useMemo(
    () =>
      !isTeamScope && meHeroState.item
        ? getHeroProgress(
            meHeroState.item.entry,
            meHeroState.item.segment.startTime ??
              getScheduleEntryStartTime(meHeroState.item.entry),
            meHeroState.item.segment.endTime ??
              getScheduleEntryEndTime(meHeroState.item.entry),
            meHeroState.status,
            currentTimeValue,
          )
        : null,
    [currentTimeValue, isTeamScope, meHeroState.item, meHeroState.status],
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
  const meRequestSections = useMemo(
    () =>
      !isTeamScope
        ? buildMeShiftRequestSections({
            linkedEmployeeId: linkedEmployee?.id ?? null,
            requests: requestsQuery.data?.requests ?? [],
          })
        : {
            coverRequests: [],
            openShiftRequests: [],
          },
    [isTeamScope, linkedEmployee?.id, requestsQuery.data?.requests],
  );
  const meOpenShifts = !isTeamScope
    ? (requestsQuery.data?.openShifts ?? [])
    : [];
  const meWeeklyHours = useMemo(
    () => (!isTeamScope ? buildWeeklyHoursSummary(activeEntries, 40) : null),
    [activeEntries, isTeamScope],
  );
  const shiftGroups = useMemo(
    () => buildScheduleShiftGroups(selectedEntries),
    [selectedEntries],
  );
  const contentState = getMobileQueryContentState({
    hasData: Boolean(activeData) && Boolean(bootstrapQuery.data),
    isLoading: scheduleQuery.isLoading || bootstrapQuery.isLoading,
    error: scheduleQuery.error ?? bootstrapQuery.error,
  });
  const emptyStateTitle = isTeamScope
    ? "No team shifts on this day"
    : "No shifts on this day";
  const emptyStateDateLabel = formatScheduleDayLabel(
    selectedDate,
    now,
    timeZone,
  ).toLowerCase();
  const emptyStateBody = isTeamScope
    ? activeTeamFocusAreaTab
      ? `No assignments are published for ${activeTeamFocusAreaTab.label} on ${emptyStateDateLabel}.`
      : `No assignments are published for ${emptyStateDateLabel}.`
    : `Nothing is scheduled for ${emptyStateDateLabel}.`;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    function refreshIfActive() {
      if (AppState.currentState !== "active") {
        return;
      }

      void refetchScreenContent();
    }

    const interval = setInterval(
      refreshIfActive,
      SCHEDULE_CONTENT_REFRESH_INTERVAL_MS,
    );
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          void refetchScreenContent();
        }
      },
    );

    return () => {
      clearInterval(interval);
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

  function handleSelectDate(nextDate: string) {
    setSelectedDateOverride(nextDate);
    setCalendarMonthAnchor(getScheduleMonthStartDate(nextDate));
    setIsCalendarOpen(false);
    setIsFilterOpen(false);
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

  function handleWeekSwipeEnd(releaseX: number) {
    if (swipeStartXRef.current == null) {
      return;
    }

    const deltaX = releaseX - swipeStartXRef.current;
    swipeStartXRef.current = null;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD) {
      return;
    }

    setIsFilterOpen(false);
    setIsCalendarOpen(false);
    setSelectedDateOverride(
      addDaysToIsoDate(selectedDate, deltaX < 0 ? 7 : -7),
    );
  }

  function handlePreviousWeek() {
    setIsFilterOpen(false);
    setIsCalendarOpen(false);
    setSelectedDateOverride(addDaysToIsoDate(selectedDate, -7));
  }

  function handleNextWeek() {
    setIsFilterOpen(false);
    setIsCalendarOpen(false);
    setSelectedDateOverride(addDaysToIsoDate(selectedDate, 7));
  }

  function handleGoToToday() {
    setIsFilterOpen(false);
    setIsCalendarOpen(false);
    setSelectedDateOverride(null);
  }

  function handleManualRefresh() {
    setIsManualRefreshing(true);
    void refetchScreenContent().finally(() => {
      setIsManualRefreshing(false);
    });
  }

  function handleToggleCalendar() {
    setIsFilterOpen(false);
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
      return;
    }

    setCalendarMonthAnchor(getScheduleMonthStartDate(selectedDate));
    setIsCalendarOpen(true);
  }

  function handleToggleFilter() {
    setIsCalendarOpen(false);
    setIsFilterOpen((current) => !current);
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
        setSelectedDateOverride(firstMatchingDate);
        setCalendarMonthAnchor(getScheduleMonthStartDate(firstMatchingDate));
      }
    }

    setIsFilterOpen(false);
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

  const meStickyHeader = !isTeamScope ? (
    <View style={styles.meWeekNavigator}>
      <View style={styles.meWeekNavigatorCopy}>
        <Text style={styles.meWeekNavigatorTitle}>{selectedDateLabel}</Text>
        <Text style={styles.meWeekNavigatorSubtitle}>{weekRangeLabel}</Text>
      </View>
      <View style={styles.meWeekNavigatorActions}>
        {!isSelectedToday ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleGoToToday}
            style={({ pressed }) => [
              styles.meTodayButton,
              pressed && styles.meTodayButtonPressed,
            ]}
          >
            <Text style={styles.meTodayButtonText}>Today</Text>
          </Pressable>
        ) : null}
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
        <AlertsChromeButton unreadCount={unreadNotificationCount} />
      </View>
    </View>
  ) : undefined;

  const stickyHeader = isTeamScope ? (
    <View style={styles.stickyControlsSection}>
      <View style={styles.teamHeaderUtilityRow}>
        <Text style={styles.teamHeaderTitle}>{activeTeamFocusAreaLabel}</Text>
        <View style={styles.teamHeaderActions}>
          {teamFocusAreaTabs.length > 0 ? (
            <View style={styles.filterMenuAnchor}>
              <IconControlButton
                accessibilityLabel="Filter focus areas"
                iconName="funnel-outline"
                onPress={handleToggleFilter}
              />
              {!isBlockedTeamView && isFilterOpen ? (
                <View style={styles.filterPopup}>
                  <Text style={styles.filterSheetLabel}>
                    Browse by {focusAreaLabel.toLowerCase()}
                  </Text>
                  {teamFocusAreaTabs.map((tab) => {
                    const isActive = tab.key === activeTeamFocusAreaKey;

                    return (
                      <Pressable
                        key={tab.key}
                        accessibilityRole="button"
                        onPress={() => {
                          handleSelectFocusArea(tab.key);
                        }}
                        style={[
                          styles.filterOption,
                          isActive && styles.filterOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterOptionText,
                            isActive && styles.filterOptionTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.calendarMenuAnchor}>
            <IconControlButton
              accessibilityLabel="Open month calendar"
              iconName="calendar-outline"
              iconSize={10}
              onPress={handleToggleCalendar}
            />
            {isCalendarOpen ? (
              <View style={styles.monthCalendarPopup}>
                <MonthCalendar
                  monthLabel={monthCalendarLabel}
                  weeks={monthWeeks}
                  onNextMonth={handleNextMonth}
                  onPreviousMonth={handlePreviousMonth}
                  onSelectDate={handleSelectDate}
                />
              </View>
            ) : null}
          </View>
          <AlertsChromeButton unreadCount={unreadNotificationCount} />
        </View>
      </View>

      <View
        accessibilityLabel="Schedule week strip"
        onResponderGrant={(event) => {
          swipeStartXRef.current = event.nativeEvent.pageX;
        }}
        onResponderRelease={(event) => {
          handleWeekSwipeEnd(event.nativeEvent.pageX);
        }}
        onStartShouldSetResponder={() => true}
        style={styles.weekStrip}
      >
        {weekDays.map((day) => (
          <DayChip
            key={day.date}
            day={day}
            onPress={() => handleSelectDate(day.date)}
          />
        ))}
      </View>
    </View>
  ) : (
    meStickyHeader
  );

  return (
    <Screen
      refreshing={isManualRefreshing || requestActionMutation.isPending}
      onRefresh={handleManualRefresh}
      scrollViewRef={!isTeamScope ? meScrollViewRef : undefined}
      stickyHeader={stickyHeader}
    >
      {contentState.kind === "loading" ? (
        <QueryStateCard
          title="Loading schedule"
          body="Pulling the latest published schedule into mobile."
        />
      ) : contentState.kind === "error" ? (
        <QueryStateCard
          title="Could not load schedule"
          body={contentState.message}
          actionLabel="Try Again"
          onAction={() => {
            void refetchScreenContent();
          }}
        />
      ) : isBlockedTeamView ? (
        <Card
          title="Team schedule unavailable"
          body="This mobile account does not have permission to view the team-wide schedule."
        />
      ) : !isTeamScope && !linkedEmployee ? (
        <Card
          title="No linked staff profile"
          body="This account is not connected to a staff profile yet. Use the web app to finish account linking, then refresh mobile."
        />
      ) : !isTeamScope ? (
        <View style={styles.mePage}>
          <MeHeroCard
            featuredItem={meHeroState.item}
            progress={meHeroProgress}
            shiftmates={meHeroShiftmates}
            status={meHeroState.status}
            onPress={
              meHeroState.item
                ? () => handleOpenShiftDetail(meHeroState.item!.entry)
                : undefined
            }
          />
          <ShiftCoverRequestsSection
            isLoading={requestsQuery.isLoading}
            linkedEmployeeId={linkedEmployee?.id ?? null}
            mutationPending={requestActionMutation.isPending}
            onRespond={(requestId, accept) => {
              if (!linkedEmployee?.id) {
                return;
              }

              requestActionMutation.mutate({
                requestId,
                body: {
                  action: "respond",
                  empId: linkedEmployee.id,
                  accept,
                },
              });
            }}
            requests={meRequestSections.coverRequests}
            requestsError={requestsQuery.error}
          />
          <OpenShiftsSection
            isLoading={requestsQuery.isLoading}
            linkedEmployeeId={linkedEmployee?.id ?? null}
            mutationPending={requestActionMutation.isPending}
            onClaim={(requestId) => {
              if (!linkedEmployee?.id) {
                return;
              }

              requestActionMutation.mutate({
                requestId,
                body: {
                  action: "claim",
                  claimerEmpId: linkedEmployee.id,
                },
              });
            }}
            onVolunteer={(openShift) => {
              if (!linkedEmployee?.id) {
                return;
              }

              requestActionMutation.mutate({
                requestId: openShift.id,
                body: {
                  action: "volunteer_open_shift",
                  empId: linkedEmployee.id,
                  shiftDate: openShift.date,
                  focusAreaId: openShift.focusAreaId,
                  state: openShift.state,
                },
              });
            }}
            onSeeAll={() => router.push("/(tabs)/requests")}
            openShifts={meOpenShifts}
            requests={meRequestSections.openShiftRequests}
            requestsError={requestsQuery.error}
          />
          <UpcomingShiftsSection
            items={meUpcomingItems}
            onPressEntry={handleOpenShiftDetail}
            summary={meWeeklyHours}
          />
          {requestActionMutation.error ? (
            <SectionStateCard body="We couldn't update that shift request right now." />
          ) : null}
        </View>
      ) : shiftGroups.length === 0 ? (
        <Card title={emptyStateTitle} body={emptyStateBody} />
      ) : (
        <View style={styles.shiftGroupsList}>
          {shiftGroups.map((group, index) => {
            const groupTimeRange = getScheduleShiftGroupTimeRange(
              group.entries,
            );

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
                    {group.entries.map((entry, memberIndex) => (
                      <TeamShiftMemberRow
                        key={`${entry.employeeId}-${entry.date}-${getScheduleEntryTitle(entry)}-${getScheduleEntryFocusAreaId(entry) ?? "general"}-${getScheduleEntryStartTime(entry) ?? "none"}-${getScheduleEntryEndTime(entry) ?? "none"}`}
                        entry={entry}
                        groupTimeRange={groupTimeRange}
                        isFirst={memberIndex === 0}
                        onPress={() => handleOpenShiftDetail(entry)}
                      />
                    ))}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
      accessibilityRole="button"
      onPress={onPress}
      style={styles.dayChip}
    >
      <View
        style={[
          styles.dayChipBody,
          day.isSelected && styles.dayChipBodySelected,
          day.isToday && !day.isSelected && styles.dayChipBodyToday,
        ]}
      >
        <Text
          style={[
            styles.dayChipWeekday,
            day.isSelected && styles.dayChipWeekdaySelected,
          ]}
        >
          {day.weekdayLabel}
        </Text>
        <Text
          style={[
            styles.dayChipDay,
            day.isSelected && styles.dayChipDaySelected,
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
  iconName: ComponentProps<typeof Ionicons>["name"];
  iconSize?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
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

export function MeScheduleScreen() {
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
    return "Nothing scheduled";
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
};

type JobChip = AvatarTone & {
  label: string;
};

function normalizeScheduleLabel(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildJobChip(
  label: string | null | undefined,
  colorSource?: JobColorSource | null,
): JobChip | null {
  if (!label) {
    return null;
  }

  if (
    colorSource?.jobColor ||
    colorSource?.jobBorderColor ||
    colorSource?.jobTextColor
  ) {
    return {
      label,
      backgroundColor: colorSource.jobColor ?? mobileColors.surfaceSecondary,
      borderColor: colorSource.jobBorderColor ?? mobileColors.border,
      textColor: colorSource.jobTextColor ?? mobileColors.textMuted,
    };
  }

  const normalizedLabel = label.trim().toLowerCase();
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
    label,
    ...tone,
  };
}

function getScheduleItemJobChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  if (!item) {
    return null;
  }

  const jobName = getScheduleItemJobName(item);
  return buildJobChip(jobName, item.segment);
}

function getScheduleItemTypeChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  if (!item) {
    return null;
  }

  if (getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return {
      label: "Absence",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textMuted,
    };
  }

  return getScheduleItemJobChip(item);
}

function getVisibleScheduleItemTypeChip(
  item: FeaturedMeScheduleSegment["item"],
): JobChip | null {
  const typeChip = getScheduleItemTypeChip(item);

  if (!item || !typeChip) {
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

function getMeHeroShiftmates(
  item: FeaturedMeScheduleSegment["item"],
  teamEntries: MobileScheduleEntry[],
): MobileScheduleEntry[] {
  if (!item || getScheduleEntryAbsenceTypeId(item.entry) != null) {
    return [];
  }

  const activeCategoryKey = getScheduleEntryCategoryKey(item.entry);
  const matchingEntries = teamEntries.filter(
    (entry) =>
      entry.date === item.date &&
      entry.employeeId !== item.entry.employeeId &&
      getScheduleEntryCategoryKey(entry) === activeCategoryKey,
  );
  const matchingGroup = buildScheduleShiftGroups(matchingEntries).find(
    (group) => group.key === activeCategoryKey,
  );

  return matchingGroup?.entries ?? sortScheduleEntries(matchingEntries);
}

function getRequestDateLabel(request: MobileShiftRequest): string {
  return formatCompactScheduleDate(request.requesterShiftDate);
}

function getRequestJobChip(
  request: MobileShiftRequest,
  which: "requester" | "target",
): JobChip | null {
  const segment =
    getRequestSegments(request, which).find((item) => item.jobName) ?? null;
  const jobName = getRequestJobName(request, which);
  return buildJobChip(jobName, segment);
}

function SectionStateCard({ body }: { body: string }) {
  return (
    <View style={styles.meSurfaceCard}>
      <Text style={styles.meSectionBody}>{body}</Text>
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
}: {
  chip: JobChip | null;
  compact?: boolean;
}) {
  if (!chip) {
    return null;
  }

  return (
    <View
      accessibilityLabel={`Job ${chip.label}`}
      style={[
        styles.jobPill,
        compact && styles.jobPillCompact,
        {
          backgroundColor: chip.backgroundColor,
          borderColor: chip.borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.jobPillText,
          compact && styles.jobPillTextCompact,
          { color: chip.textColor },
        ]}
      >
        {chip.label}
      </Text>
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
  featuredItem,
  status,
  progress,
  shiftmates,
  onPress,
}: {
  featuredItem: FeaturedMeScheduleSegment["item"];
  status: FeaturedMeScheduleSegment["status"];
  progress: { progress: number; remainingLabel: string } | null;
  shiftmates: MobileScheduleEntry[];
  onPress?: () => void;
}) {
  const badgeLabel = !featuredItem
    ? "No Shift"
    : status === "active"
      ? "On Duty"
      : status === "away"
        ? "Away"
        : status === "upcoming"
          ? "Upcoming"
          : "Scheduled";
  const displayedShiftDate = featuredItem?.date ?? null;
  const heroDateLabel = displayedShiftDate
    ? formatCompactScheduleDate(displayedShiftDate)
    : null;
  const heroDateParts = displayedShiftDate
    ? getCompactScheduleDateParts(displayedShiftDate)
    : null;
  const shiftName = getScheduleItemShiftName(featuredItem);
  const typeChip = getVisibleScheduleItemTypeChip(featuredItem);
  const focusAreaName = getScheduleItemFocusArea(featuredItem);
  const timeRange = getScheduleItemTimeRange(featuredItem);
  const badgeDotStyle =
    status === "active"
      ? styles.meHeroBadgeDotActive
      : status === "away" || status === "empty"
        ? styles.meHeroBadgeDotMuted
        : styles.meHeroBadgeDotScheduled;

  const cardContent = (
    <View style={styles.meHeroContent}>
      <View style={styles.meHeroHeader}>
        <View style={styles.meHeroBadge}>
          {featuredItem ? (
            <View style={[styles.meHeroBadgeDot, badgeDotStyle]} />
          ) : null}
          <Text style={styles.meHeroBadgeText}>{badgeLabel}</Text>
        </View>
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

      {!featuredItem ? (
        <View style={styles.meHeroEmptyBlock}>
          <Text style={styles.meHeroTitle}>{shiftName}</Text>
          <Text style={styles.meHeroEmptyText}>
            Published jobs for this selected week will appear here.
          </Text>
        </View>
      ) : (
        <>
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
          <Text style={styles.meHeroTitle}>{shiftName}</Text>
          {typeChip ? (
            <View style={styles.meHeroRoleRow}>
              <JobPill chip={typeChip} compact />
            </View>
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
              {progress ? (
                <Text style={styles.meHeroProgressLabel}>
                  {progress.remainingLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
          {progress ? (
            <View style={styles.meHeroProgressTrack}>
              <View
                style={[
                  styles.meHeroProgressFill,
                  { width: `${Math.max(progress.progress, 0.08) * 100}%` },
                ]}
              />
            </View>
          ) : null}
          <MeHeroShiftmates entries={shiftmates} />
        </>
      )}
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
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.meHeroCard}>{cardContent}</View>
      )}
    </View>
  );
}

function UpcomingShiftsSection({
  items,
  onPressEntry,
  summary,
}: {
  items: ReturnType<typeof buildUpcomingMeScheduleItems>;
  onPressEntry: (entry: MobileScheduleEntry) => void;
  summary: WeeklyHoursSummary | null;
}) {
  if (items.length === 0) {
    return null;
  }

  const hoursLabel =
    summary && summary.scheduledHours > 0
      ? `${formatHoursValue(summary.scheduledHours)}h this week`
      : null;

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
        {items.map((item, index) => {
          const dateParts = getCompactScheduleDateParts(item.date);
          const typeChip = getScheduleItemTypeChip(item);
          const focusAreaName = getScheduleItemFocusArea(item);
          const timeRange = getScheduleItemTimeRange(item);

          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() => onPressEntry(item.entry)}
              style={[
                styles.upcomingShiftRow,
                index > 0 && styles.upcomingShiftRowBorder,
              ]}
            >
              <View style={styles.upcomingDateTile}>
                <Text style={styles.upcomingDateWeekday}>
                  {dateParts.weekdayLabel}
                </Text>
                <Text style={styles.upcomingDateDay}>{dateParts.dayLabel}</Text>
              </View>

              <View style={styles.upcomingShiftCopy}>
                <Text style={styles.upcomingShiftTitle}>
                  {getScheduleItemShiftName(item)}
                </Text>
                {focusAreaName ? (
                  <Text style={styles.upcomingShiftArea}>{focusAreaName}</Text>
                ) : null}
                <JobPill chip={typeChip} compact />
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

              <View style={styles.upcomingShiftAction}>
                <Ionicons
                  color={mobileColors.textMuted}
                  name="swap-horizontal-outline"
                  size={24}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OpenShiftsSection({
  requests,
  openShifts,
  linkedEmployeeId,
  isLoading,
  mutationPending,
  requestsError,
  onClaim,
  onVolunteer,
  onSeeAll,
}: {
  requests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  linkedEmployeeId: string | null;
  isLoading: boolean;
  mutationPending: boolean;
  requestsError: unknown;
  onClaim: (requestId: string) => void;
  onVolunteer: (openShift: MobileOpenShift) => void;
  onSeeAll: () => void;
}) {
  if (
    !isLoading &&
    !requestsError &&
    requests.length === 0 &&
    openShifts.length === 0
  ) {
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
        <SectionStateCard body="Loading open shifts you can claim." />
      ) : requestsError ? (
        <SectionStateCard body="We couldn't load open shifts right now." />
      ) : (
        <ScrollView
          horizontal
          contentContainerStyle={styles.openShiftScrollContent}
          showsHorizontalScrollIndicator={false}
        >
          {openShifts.map((openShift) => {
            const jobChip = getOpenShiftJobChip(openShift);
            const focusAreaName = getOpenShiftFocusAreaName(openShift);
            const timeRange = getOpenShiftTimeRange(openShift);

            return (
              <View key={openShift.id} style={styles.openShiftCard}>
                <Text style={styles.scheduleRowDate}>
                  {formatCompactScheduleDate(openShift.date)}
                </Text>
                <Text style={styles.scheduleRowTitle}>
                  {getOpenShiftShiftName(openShift)}
                </Text>
                {jobChip || focusAreaName ? (
                  <View style={styles.scheduleRowContext}>
                    <JobPill chip={jobChip} compact />
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
                <Button
                  disabled={mutationPending || !linkedEmployeeId}
                  label="Volunteer"
                  leadingAccessory={
                    <Ionicons
                      color={mobileColors.brand}
                      name="add-circle-outline"
                      size={18}
                    />
                  }
                  onPress={() => onVolunteer(openShift)}
                  tone="secondary"
                />
              </View>
            );
          })}
          {requests.map((request) => {
            const jobChip = getRequestJobChip(request, "requester");
            const focusAreaName = getRequestFocusAreaName(request, "requester");
            const timeRange = getRequestTimeRange(request, "requester");

            return (
              <View key={request.id} style={styles.openShiftCard}>
                <Text style={styles.scheduleRowDate}>
                  {getRequestDateLabel(request)}
                </Text>
                <Text style={styles.scheduleRowTitle}>
                  {getRequestShiftName(request, "requester")}
                </Text>
                {jobChip || focusAreaName ? (
                  <View style={styles.scheduleRowContext}>
                    <JobPill chip={jobChip} compact />
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
                <Button
                  disabled={mutationPending || !linkedEmployeeId}
                  label="Claim Shift"
                  leadingAccessory={
                    <Ionicons
                      color={mobileColors.brand}
                      name="add-circle-outline"
                      size={18}
                    />
                  }
                  onPress={() => onClaim(request.id)}
                  tone="secondary"
                />
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
  mutationPending,
  requestsError,
  onRespond,
}: {
  requests: MobileShiftRequest[];
  linkedEmployeeId: string | null;
  isLoading: boolean;
  mutationPending: boolean;
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
        <SectionStateCard body="Loading shift cover requests." />
      ) : requestsError ? (
        <SectionStateCard body="We couldn't load cover requests right now." />
      ) : (
        <View style={styles.requestList}>
          {requests.map((request) => {
            const avatarTone = getAvatarTone(request.requesterEmpId);
            const jobChip = getRequestJobChip(request, "requester");
            const focusAreaName = getRequestFocusAreaName(request, "requester");
            const timeRange = getRequestTimeRange(request, "requester");

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

                <Text style={styles.scheduleRowTitle}>
                  {getRequestShiftName(request, "requester")}
                </Text>
                {jobChip || focusAreaName ? (
                  <View style={styles.scheduleRowContext}>
                    <JobPill chip={jobChip} compact />
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
                    disabled={mutationPending || !linkedEmployeeId}
                    label="Accept"
                    onPress={() => onRespond(request.id, true)}
                  />
                  <Button
                    disabled={mutationPending || !linkedEmployeeId}
                    label="Decline"
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
  entry,
  groupTimeRange,
  isFirst,
  onPress,
}: {
  entry: MobileScheduleEntry;
  groupTimeRange: string | null;
  isFirst: boolean;
  onPress: () => void;
}) {
  const avatarTone = getAvatarTone(entry.employeeId);
  const memberTimeRange = getScheduleEntryMemberTimeRange(
    entry,
    groupTimeRange,
  );
  const roleChip = getTeamMemberRoleChip(entry);

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
          <Text style={styles.teamMemberName}>{entry.employeeName}</Text>
          {memberTimeRange ? (
            <Text style={styles.teamMemberTime}>{memberTimeRange}</Text>
          ) : null}
        </View>
        {roleChip ? (
          <View
            style={[
              styles.teamMemberRoleChip,
              {
                backgroundColor: roleChip.backgroundColor,
                borderColor: roleChip.borderColor,
              },
            ]}
          >
            <Text
              style={[
                styles.teamMemberRoleChipText,
                { color: roleChip.textColor },
              ]}
            >
              {roleChip.label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function getTeamMemberRoleChip(entry: MobileScheduleEntry):
  | (AvatarTone & {
      label: string;
    })
  | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return {
      label: "Absence",
      backgroundColor: mobileColors.surfaceSecondary,
      borderColor: mobileColors.border,
      textColor: mobileColors.textMuted,
    };
  }

  const segment =
    getScheduleEntrySegments(entry).find((item) => item.jobName) ?? null;
  const label = segment?.jobName ?? null;

  if (!segment || !label) {
    return null;
  }

  if (segment.jobColor || segment.jobBorderColor || segment.jobTextColor) {
    return {
      label,
      backgroundColor: segment.jobColor ?? mobileColors.surfaceSecondary,
      borderColor: segment.jobBorderColor ?? mobileColors.border,
      textColor: segment.jobTextColor ?? mobileColors.textMuted,
    };
  }

  const normalizedLabel = label.trim().toLowerCase();
  const tone =
    normalizedLabel.includes("supervisor") ||
    normalizedLabel.includes("lead") ||
    normalizedLabel.includes("manager")
      ? {
          backgroundColor: "#EEF2FF",
          borderColor: "#C7D2FE",
          textColor: "#4F46E5",
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
    label,
    ...tone,
  };
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
  stickyControlsSection: {
    gap: 16,
  },
  mePage: {
    gap: 22,
    paddingTop: 8,
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
    color: mobileColors.textSubtle,
    fontSize: 14,
    fontWeight: "600",
  },
  meWelcomeTitle: {
    color: mobileColors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 25,
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
    gap: 4,
  },
  meWeekNavigatorTitle: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  meWeekNavigatorSubtitle: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  meWeekNavigatorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  meTodayButton: {
    minHeight: 42,
    borderRadius: 21,
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
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "800",
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
    alignItems: "center",
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
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: mobileRadii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    color: mobileColors.textInverse,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
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
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  meHeroDateDay: {
    color: mobileColors.textInverse,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 28,
  },
  meHeroDateText: {
    alignSelf: "flex-start",
    color: "rgba(255, 255, 255, 0.86)",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  meHeroTitle: {
    color: mobileColors.textInverse,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 30,
  },
  meHeroHeading: {
    color: mobileColors.textInverse,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  meHeroHeadingMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroTitleMuted: {
    color: mobileColors.textPrimary,
  },
  meHeroSupportingText: {
    color: "rgba(255, 255, 255, 0.84)",
    fontSize: 14,
    fontWeight: "600",
  },
  meHeroSupportingTextMuted: {
    color: mobileColors.textMuted,
  },
  meHeroAreaLabel: {
    color: "rgba(255, 255, 255, 0.86)",
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
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
    alignItems: "center",
    gap: 10,
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
    color: mobileColors.textInverse,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
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
    color: mobileColors.textInverse,
    fontSize: 14,
    fontWeight: "800",
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
    color: "rgba(255, 255, 255, 0.84)",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
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
    color: "rgba(255, 255, 255, 0.86)",
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
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
    color: "rgba(255, 255, 255, 0.84)",
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
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
    marginLeft: -14,
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
    fontSize: 13,
    fontWeight: "800",
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
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "800",
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
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  upcomingHoursBadge: {
    borderRadius: 12,
    backgroundColor: mobileColors.brandSoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  upcomingHoursBadgeText: {
    color: mobileColors.brand,
    fontSize: 14,
    fontWeight: "800",
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
    color: mobileColors.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  upcomingDateDay: {
    color: mobileColors.textSecondary,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  upcomingShiftCopy: {
    flex: 1,
    minWidth: 0,
    gap: 9,
  },
  upcomingShiftTitle: {
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  upcomingShiftArea: {
    color: mobileColors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  upcomingShiftTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  upcomingShiftTimeText: {
    color: mobileColors.textSubtle,
    fontSize: 14,
    fontWeight: "700",
  },
  upcomingShiftAction: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    backgroundColor: mobileColors.surface,
    shadowColor: mobileColors.shadowStrong,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
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
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  meSectionLink: {
    color: mobileColors.brand,
    fontSize: 14,
    fontWeight: "800",
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
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 22,
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
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  scheduleRowTitle: {
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  scheduleRowMeta: {
    color: mobileColors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  scheduleRowContext: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scheduleRowTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scheduleRowTimeText: {
    color: mobileColors.textMuted,
    fontSize: 15,
    fontWeight: "600",
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
  openShiftScrollContent: {
    gap: 14,
    paddingRight: 4,
  },
  openShiftCard: {
    width: 296,
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
    fontSize: 14,
    fontWeight: "800",
  },
  requestHeaderText: {
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  requestHeaderTextStack: {
    flex: 1,
    gap: 2,
  },
  requestHeaderSubtext: {
    color: mobileColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  requestDateText: {
    color: mobileColors.textMuted,
    fontSize: 14,
    fontWeight: "700",
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
  jobPillText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  jobPillTextCompact: {
    fontSize: 12,
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
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "800",
  },
  meCollaboratorCopy: {
    flex: 1,
    gap: 8,
  },
  meCollaboratorName: {
    color: mobileColors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
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
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
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
  meSelectedDateTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "left",
    lineHeight: 23,
  },
  teamHeaderTitle: {
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
    textAlign: "left",
    flexShrink: 1,
    minWidth: 0,
  },
  iconControlButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
    backgroundColor: mobileColors.brand,
    borderColor: mobileColors.brand,
  },
  dayChipBodyToday: {
    backgroundColor: mobileColors.surfaceSecondary,
    borderColor: mobileColors.borderSubtle,
  },
  dayChipWeekday: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
  },
  dayChipWeekdaySelected: {
    color: mobileColors.textInverse,
  },
  dayChipDay: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  dayChipDaySelected: {
    color: mobileColors.textInverse,
  },
  monthCalendar: {
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 16,
    gap: 14,
    shadowColor: mobileColors.shadowStrong,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 3,
  },
  monthCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 6,
  },
  monthCalendarTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
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
  filterMenuAnchor: {
    position: "relative",
    zIndex: 10,
  },
  calendarMenuAnchor: {
    position: "relative",
    zIndex: 10,
  },
  monthCalendarPopup: {
    position: "absolute",
    top: 50,
    right: 0,
    width: 320,
    zIndex: 12,
  },
  filterPopup: {
    position: "absolute",
    top: 50,
    right: 0,
    width: 220,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    padding: 14,
    gap: 8,
    shadowColor: mobileColors.shadowStrong,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 6,
  },
  filterSheetLabel: {
    color: mobileColors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  filterOption: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: mobileColors.surfaceSecondary,
  },
  filterOptionActive: {
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
  },
  filterOptionText: {
    color: mobileColors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  filterOptionTextActive: {
    color: mobileColors.brand,
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
  },
  shiftGroupBlock: {
    gap: 12,
  },
  shiftGroupDivider: {
    height: 1,
    backgroundColor: mobileColors.borderSubtle,
  },
  shiftGroupHeader: {
    gap: 6,
    paddingHorizontal: 8,
  },
  shiftGroupTitle: {
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
  },
  shiftGroupTime: {
    color: mobileColors.textSubtle,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  weekDaySection: {
    gap: 12,
  },
  weekDayHeader: {
    gap: 4,
  },
  weekDayTitle: {
    color: mobileColors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
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
    color: mobileColors.textMuted,
    fontSize: 14,
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
    color: mobileColors.brand,
    fontSize: 14,
    fontWeight: "800",
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
  teamMemberName: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  teamMemberTime: {
    color: mobileColors.textSubtle,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  teamMemberRoleChip: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  teamMemberRoleChipText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
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
    color: mobileColors.textInverse,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  heroSegmentMeta: {
    color: "rgba(255, 255, 255, 0.84)",
    fontSize: 14,
    fontWeight: "600",
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
    color: mobileColors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  timelineSegmentMeta: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
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
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  entryMetaText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});

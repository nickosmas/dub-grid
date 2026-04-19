import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { QueryStateCard } from "../../../shared/components/QueryStateCard";
import {
  Card,
  Screen,
  type ScreenScrollHandle,
} from "../../../shared/components/Screen";
import { getMySchedule, getOrgSchedule } from "../../../shared/lib/api";
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
  buildScheduleMonthDays,
  buildScheduleShiftGroups,
  buildScheduleWeekDays,
  buildTeamScheduleFocusAreaTabs,
  filterScheduleEntriesByDate,
  filterTeamScheduleEntriesByFocusArea,
  formatScheduleDayLabel,
  formatScheduleMonthLabel,
  formatScheduleRange,
  getScheduleEntryBaseTimeRange,
  getScheduleEntryCustomTimeRange,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleMonthStartDate,
  getScheduleRangeForDate,
  getScheduleShiftGroupTimeRange,
  getIsoDateInTimeZone,
  sortScheduleEntries,
  type MobileScheduleMonthDay,
  type MobileScheduleWeekDay,
} from "../lib/schedule";
import type { MobileScheduleEntry } from "@dubgrid/contracts";

const SWIPE_THRESHOLD = 40;
const MONTH_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ScheduleScope = "mine" | "team";
type ShiftTimeRange = {
  start: string;
  end: string;
};
type MeHeroState = {
  entry: MobileScheduleEntry | null;
  status: "active" | "upcoming" | "scheduled" | "away" | "empty";
};
type MeTimelineSection = {
  date: string;
  title: string;
  entries: MobileScheduleEntry[];
};
type AvatarTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
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

  return [...matchingEntries]
    .sort((left, right) => {
      if (left.date !== right.date) {
        return left.date.localeCompare(right.date);
      }

      const leftTime = left.startTime ?? left.customStartTime ?? "99:99:99";
      const rightTime = right.startTime ?? right.customStartTime ?? "99:99:99";
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }

      return left.employeeName.localeCompare(right.employeeName);
    })[0]?.date ?? null;
}

function formatVerboseScheduleDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
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

function getGreetingLabel(value: Date, timeZone?: string | null): string {
  const { hour } = getTimePartsInTimeZone(value, timeZone);

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
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

function getEntryTimeRanges(entry: MobileScheduleEntry): ShiftTimeRange[] {
  return getDisplaySegments(entry).flatMap((segment) => {
    if (!segment.startTime || !segment.endTime) {
      return [];
    }

    return [
      {
        start: segment.startTime,
        end: segment.endTime,
      },
    ];
  });
}

function isTimeWithinEntry(
  entry: MobileScheduleEntry,
  currentTime: string,
): boolean {
  const currentMinutes = getMinutesSinceMidnight(currentTime);

  if (currentMinutes == null) {
    return false;
  }

  return getEntryTimeRanges(entry)
    .flatMap(expandTimeRange)
    .some(
      (range) =>
        currentMinutes >= range.start && currentMinutes < range.end,
  );
}

function getDisplaySegments(entry: MobileScheduleEntry) {
  const segments = getScheduleEntrySegments(entry);

  if (segments.length > 0 && entry.segments && entry.segments.length > 0) {
    return segments;
  }

  return [
    {
      shiftName: entry.shiftName,
      startTime: entry.customStartTime ?? entry.startTime,
      endTime: entry.customEndTime ?? entry.endTime,
      displayFocusAreaName: entry.displayFocusAreaName ?? null,
    },
  ];
}

function entriesHaveOverlappingTimes(
  left: MobileScheduleEntry | null,
  right: MobileScheduleEntry | null,
): boolean {
  if (!left || !right) {
    return false;
  }

  const leftRanges = getEntryTimeRanges(left).flatMap(expandTimeRange);
  const rightRanges = getEntryTimeRanges(right).flatMap(expandTimeRange);

  if (leftRanges.length === 0 || rightRanges.length === 0) {
    return false;
  }

  return leftRanges.some((leftRange) =>
    rightRanges.some(
      (rightRange) =>
        leftRange.start < rightRange.end &&
        rightRange.start < leftRange.end,
    ),
  );
}

function getEntrySortTime(entry: MobileScheduleEntry): string {
  const segmentStart =
    getDisplaySegments(entry).find((segment) => segment.startTime)
      ?.startTime ?? null;

  return segmentStart ?? entry.startTime ?? entry.customStartTime ?? "99:99:99";
}

function sortEntriesChronologically(
  entries: MobileScheduleEntry[],
): MobileScheduleEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftTime = getEntrySortTime(left);
    const rightTime = getEntrySortTime(right);

    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }

    return left.shiftName.localeCompare(right.shiftName);
  });
}

function getScheduleEntryKey(entry: MobileScheduleEntry): string {
  return [
    entry.employeeId,
    entry.date,
    entry.shiftName,
    entry.shiftLabel,
    entry.startTime ?? entry.customStartTime ?? "none",
    entry.endTime ?? entry.customEndTime ?? "none",
  ].join(":");
}

function getFeaturedMeEntry({
  entries,
  selectedDate,
  todayDate,
  currentTime,
}: {
  entries: MobileScheduleEntry[];
  selectedDate: string;
  todayDate: string;
  currentTime: string;
}): MeHeroState {
  const selectedDayEntries = sortEntriesChronologically(
    entries.filter((entry) => entry.date === selectedDate),
  );

  if (selectedDate === todayDate) {
    const activeEntry =
      selectedDayEntries.find(
        (entry) =>
          entry.absenceTypeId == null &&
          getEntryTimeRanges(entry).length > 0 &&
          isTimeWithinEntry(entry, currentTime),
      ) ?? null;

    if (activeEntry) {
      return {
        entry: activeEntry,
        status: "active",
      };
    }

    const upcomingTodayEntry =
      selectedDayEntries.find((entry) => {
        if (entry.absenceTypeId != null) {
          return false;
        }

        return getEntrySortTime(entry).localeCompare(currentTime) > 0;
      }) ?? null;

    if (upcomingTodayEntry) {
      return {
        entry: upcomingTodayEntry,
        status: "upcoming",
      };
    }
  }

  const selectedDayEntry = selectedDayEntries[0] ?? null;

  if (selectedDayEntry) {
    return {
      entry: selectedDayEntry,
      status: selectedDayEntry.absenceTypeId != null ? "away" : "scheduled",
    };
  }

  const nextEntry =
    sortEntriesChronologically(
      entries.filter((entry) => entry.date.localeCompare(selectedDate) > 0),
    )[0] ?? null;

  if (nextEntry) {
    return {
      entry: nextEntry,
      status: nextEntry.absenceTypeId != null ? "away" : "upcoming",
    };
  }

  return {
    entry: null,
    status: "empty",
  };
}

function buildMeTimelineSections({
  entries,
  featuredEntry,
  selectedDate,
  timeZone,
}: {
  entries: MobileScheduleEntry[];
  featuredEntry: MobileScheduleEntry | null;
  selectedDate: string;
  timeZone?: string | null;
}): MeTimelineSection[] {
  const visibleEntries = sortEntriesChronologically(entries).filter(
    (entry) => entry.date.localeCompare(selectedDate) >= 0,
  );

  const featuredEntryKey = featuredEntry ? getScheduleEntryKey(featuredEntry) : null;
  const featuredIndex =
    featuredEntryKey == null
      ? -1
      : visibleEntries.findIndex(
          (entry) => getScheduleEntryKey(entry) === featuredEntryKey,
        );
  const timelineEntries =
    featuredIndex >= 0 ? visibleEntries.slice(featuredIndex + 1) : visibleEntries;
  const grouped = new Map<string, MobileScheduleEntry[]>();

  for (const entry of timelineEntries) {
    const existingEntries = grouped.get(entry.date) ?? [];
    existingEntries.push(entry);
    grouped.set(entry.date, existingEntries);
  }

  return Array.from(grouped.entries()).map(([date, groupedEntries]) => ({
    date,
    title: formatScheduleDayLabel(date, new Date(), timeZone),
    entries: groupedEntries,
  }));
}

function getHeroStatusLabel(status: MeHeroState["status"]): string {
  switch (status) {
    case "active":
      return "On Duty";
    case "upcoming":
      return "Up Next";
    case "away":
      return "Away";
    case "scheduled":
      return "Scheduled";
    default:
      return "Open Week";
  }
}

function getHeroTitle(
  entry: MobileScheduleEntry | null,
  _selectedDate: string,
  todayDate: string,
): string {
  if (!entry) {
    return "Nothing scheduled";
  }

  const segments = getDisplaySegments(entry);

  if (segments.length > 1) {
    return entry.date === todayDate ? "Today's shifts" : "Scheduled shifts";
  }

  return entry.shiftName;
}

function formatDurationLabel(totalMinutes: number): string {
  const minutes = Math.max(totalMinutes, 0);
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;

  if (hoursPart === 0) {
    return `${minutesPart}m remaining`;
  }

  if (minutesPart === 0) {
    return `${hoursPart}h remaining`;
  }

  return `${hoursPart}h ${minutesPart}m remaining`;
}

function getEntryOverallTimeRange(entry: MobileScheduleEntry): ShiftTimeRange | null {
  const ranges = getEntryTimeRanges(entry);
  const firstRange = ranges[0] ?? null;
  const lastRange = ranges[ranges.length - 1] ?? null;

  if (!firstRange || !lastRange) {
    return null;
  }

  return {
    start: firstRange.start,
    end: lastRange.end,
  };
}

function getHeroProgress(
  entry: MobileScheduleEntry | null,
  status: MeHeroState["status"],
  currentTime: string,
): { progress: number; remainingLabel: string } | null {
  if (!entry || status !== "active" || getDisplaySegments(entry).length > 1) {
    return null;
  }

  const overallRange = getEntryOverallTimeRange(entry);

  if (!overallRange) {
    return null;
  }

  const [normalizedRange] = expandTimeRange(overallRange);
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

export function ScheduleScreen({ scope }: { scope: ScheduleScope }) {
  const accessToken = useAccessToken();
  const bootstrapQuery = useBootstrap(accessToken);
  const [selectedTeamFocusAreaKey, setSelectedTeamFocusAreaKey] = useState<
    string | null
  >(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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
  const todayDate = getIsoDateInTimeZone(new Date(), timeZone);
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
    enabled:
      Boolean(accessToken) && (!isTeamScope || Boolean(canViewTeamSchedule)),
  });
  const meTeamScheduleQuery = useQuery({
    queryKey: [
      "mobile",
      "schedule",
      "team",
      accessToken,
      range.startDate,
      range.endDate,
      "me-collaborators",
    ],
    queryFn: () => getOrgSchedule(accessToken!, range),
    enabled: Boolean(accessToken) && !isTeamScope && canViewTeamSchedule,
  });

  const activeData = scheduleQuery.data;
  const scheduleEntries = activeData?.entries ?? [];
  const linkedEmployee = bootstrapQuery.data?.linkedEmployee ?? null;
  const focusAreaLabel =
    bootstrapQuery.data?.currentOrg.labels.focusArea ?? "Focus Area";
  const unreadNotificationCount =
    bootstrapQuery.data?.unreadNotificationCount ?? 0;
  const selectedDateLabel = formatScheduleDayLabel(
    selectedDate,
    new Date(),
    timeZone,
  );
  const selectedDateLongLabel = formatVerboseScheduleDate(selectedDate);
  const weekRangeLabel = formatScheduleRange(range, timeZone);
  const currentTimeValue = getCurrentTimeValue(new Date(), timeZone);
  const greetingLabel = getGreetingLabel(new Date(), timeZone);
  const greetingName =
    linkedEmployee?.firstName ??
    bootstrapQuery.data?.user?.firstName ??
    "there";
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
  const meOrderedEntries = useMemo(
    () => (!isTeamScope ? sortEntriesChronologically(activeEntries) : []),
    [activeEntries, isTeamScope],
  );
  const meHeroState = useMemo<MeHeroState>(
    () =>
      !isTeamScope
        ? getFeaturedMeEntry({
            entries: meOrderedEntries,
            selectedDate,
            todayDate,
            currentTime: currentTimeValue,
          })
        : {
            entry: null,
            status: "empty",
          },
    [currentTimeValue, isTeamScope, meOrderedEntries, selectedDate, todayDate],
  );
  const meHeroProgress = useMemo(
    () =>
      !isTeamScope
        ? getHeroProgress(meHeroState.entry, meHeroState.status, currentTimeValue)
        : null,
    [currentTimeValue, isTeamScope, meHeroState.entry, meHeroState.status],
  );
  const meTimelineSections = useMemo(
    () =>
      !isTeamScope
        ? buildMeTimelineSections({
            entries: meOrderedEntries,
            featuredEntry: meHeroState.entry,
            selectedDate,
            timeZone,
          })
        : [],
    [isTeamScope, meHeroState.entry, meOrderedEntries, selectedDate, timeZone],
  );
  const meCollaborators = useMemo(() => {
    if (
      isTeamScope ||
      !canViewTeamSchedule ||
      !meHeroState.entry ||
      meHeroState.entry.absenceTypeId != null
    ) {
      return [];
    }

    return sortEntriesChronologically(
      (meTeamScheduleQuery.data?.entries ?? []).filter((entry) => {
        return (
          entry.employeeId !== meHeroState.entry?.employeeId &&
          entry.date === meHeroState.entry?.date &&
          entry.absenceTypeId == null &&
          entriesHaveOverlappingTimes(meHeroState.entry, entry)
        );
      }),
    );
  }, [
    canViewTeamSchedule,
    isTeamScope,
    meHeroState.entry,
    meTeamScheduleQuery.data?.entries,
  ]);
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
  const emptyStateBody = isTeamScope
    ? activeTeamFocusAreaTab
      ? `No assignments are published for ${activeTeamFocusAreaTab.label} on ${formatScheduleDayLabel(selectedDate, new Date(), timeZone).toLowerCase()}.`
      : `No assignments are published for ${formatScheduleDayLabel(selectedDate, new Date(), timeZone).toLowerCase()}.`
    : `Nothing is scheduled for ${formatScheduleDayLabel(selectedDate, new Date(), timeZone).toLowerCase()}.`;

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

  const stickyHeader = isTeamScope ? (
    <View style={styles.stickyControlsSection}>
      <View style={styles.teamHeaderUtilityRow}>
        <Text style={styles.teamHeaderTitle}>
          {activeTeamFocusAreaLabel}
        </Text>
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
  ) : undefined;

  return (
    <Screen
      refreshing={
        scheduleQuery.isFetching ||
        bootstrapQuery.isFetching ||
        (!isTeamScope && meTeamScheduleQuery.isFetching)
      }
      onRefresh={() => {
        void Promise.all([
          scheduleQuery.refetch(),
          bootstrapQuery.refetch(),
          !isTeamScope && canViewTeamSchedule
            ? meTeamScheduleQuery.refetch()
            : Promise.resolve(),
        ]);
      }}
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
            void Promise.all([
              scheduleQuery.refetch(),
              bootstrapQuery.refetch(),
            ]);
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
          <View style={styles.meTopStack}>
            <View style={styles.meWelcomeRow}>
              <View style={styles.meWelcomeCopy}>
                <Text style={styles.meWelcomeDate}>{selectedDateLongLabel}</Text>
                <Text style={styles.meWelcomeTitle}>
                  {`${greetingLabel}, ${greetingName}`}
                </Text>
              </View>
              <AlertsChromeButton unreadCount={unreadNotificationCount} />
            </View>

            <View style={styles.meWeekNavigator}>
              <View style={styles.meWeekNavigatorCopy}>
                <Text style={styles.meWeekNavigatorTitle}>{selectedDateLabel}</Text>
                <Text style={styles.meWeekNavigatorSubtitle}>{weekRangeLabel}</Text>
              </View>
              <View style={styles.meWeekNavigatorActions}>
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
            </View>
          </View>

          <MeHeroCard
            entry={meHeroState.entry}
            progress={meHeroProgress}
            selectedDate={selectedDate}
            status={meHeroState.status}
            todayDate={todayDate}
            onPress={
              meHeroState.entry
                ? () => handleOpenShiftDetail(meHeroState.entry!)
                : undefined
            }
          />

          <MeCollaboratorsCard
            canViewTeamSchedule={canViewTeamSchedule}
            collaborators={meCollaborators}
            entry={meHeroState.entry}
            isLoading={meTeamScheduleQuery.isLoading}
            hasError={Boolean(meTeamScheduleQuery.error)}
          />

          <MeTimelineCard
            sections={meTimelineSections}
            onPressEntry={handleOpenShiftDetail}
          />
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
                  <Text style={styles.shiftGroupTitle}>
                    {groupTimeRange
                      ? `${group.title} • ${groupTimeRange}`
                      : group.title}
                  </Text>
                </View>
                <View style={styles.teamGroupCard}>
                  <View style={styles.teamGroupMembers}>
                    {group.entries.map((entry, memberIndex) => (
                      <TeamShiftMemberRow
                        key={`${entry.employeeId}-${entry.date}-${entry.shiftLabel}-${entry.focusAreaId ?? "general"}-${entry.startTime ?? "none"}-${entry.endTime ?? "none"}`}
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
          onPress={onPreviousMonth}
        />
        <Text style={styles.monthCalendarTitle}>{monthLabel}</Text>
        <IconControlButton
          accessibilityLabel="Next month"
          iconName="chevron-forward"
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
  onPress,
}: {
  accessibilityLabel: string;
  iconName: ComponentProps<typeof Ionicons>["name"];
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
      <Ionicons color={mobileColors.textPrimary} name={iconName} size={20} />
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

function MeHeroCard({
  entry,
  status,
  selectedDate,
  todayDate,
  progress,
  onPress,
}: {
  entry: MobileScheduleEntry | null;
  status: MeHeroState["status"];
  selectedDate: string;
  todayDate: string;
  progress: { progress: number; remainingLabel: string } | null;
  onPress?: () => void;
}) {
  const title = getHeroTitle(entry, selectedDate, todayDate);
  const segments = entry ? getDisplaySegments(entry) : [];
  const hasMultipleSegments = segments.length > 1;
  const primarySegment = segments[0] ?? null;
  const primaryTimeRange = primarySegment
    ? getScheduleEntrySegmentTimeRange(primarySegment)
    : null;
  const secondaryDateLabel =
    entry && entry.date !== selectedDate
      ? formatScheduleDayLabel(entry.date)
      : null;
  const isMuted = status === "away" || status === "empty";

  const content = (
    <>
      <View
        style={[
          styles.meHeroGlow,
          styles.meHeroGlowLarge,
          isMuted && styles.meHeroGlowMuted,
        ]}
      />
      <View
        style={[
          styles.meHeroGlow,
          styles.meHeroGlowSmall,
          isMuted && styles.meHeroGlowMuted,
        ]}
      />
      <View style={styles.meHeroContent}>
        <View style={styles.meHeroHeader}>
          <View style={styles.meHeroHeaderCopy}>
            <View
              style={[
                styles.meHeroBadge,
                isMuted && styles.meHeroBadgeMuted,
              ]}
            >
              <View
                style={[
                  styles.meHeroBadgeDot,
                  status === "active"
                    ? styles.meHeroBadgeDotActive
                    : isMuted
                      ? styles.meHeroBadgeDotMuted
                      : styles.meHeroBadgeDotScheduled,
                ]}
              />
              <Text
                style={[
                  styles.meHeroBadgeText,
                  isMuted && styles.meHeroBadgeTextMuted,
                ]}
              >
                {getHeroStatusLabel(status)}
              </Text>
            </View>
            <Text
              style={[
                styles.meHeroTitle,
                isMuted && styles.meHeroTitleMuted,
              ]}
            >
              {title}
            </Text>
            {secondaryDateLabel ? (
              <Text
                style={[
                  styles.meHeroSupportingText,
                  isMuted && styles.meHeroSupportingTextMuted,
                ]}
              >
                {secondaryDateLabel}
              </Text>
            ) : null}
          </View>
          {onPress ? (
            <View
              style={[
                styles.meHeroActionIcon,
                isMuted && styles.meHeroActionIconMuted,
              ]}
            >
              <Ionicons
                color={isMuted ? mobileColors.textPrimary : mobileColors.textInverse}
                name="chevron-forward"
                size={18}
              />
            </View>
          ) : null}
        </View>

        {!entry ? (
          <Text
            style={[
              styles.meHeroEmptyText,
              isMuted && styles.meHeroEmptyTextMuted,
            ]}
          >
            Nothing is published for this week yet.
          </Text>
        ) : hasMultipleSegments ? (
          <ScheduleEntrySegmentList entry={entry} variant="hero" />
        ) : (
          <View style={styles.meHeroDetails}>
            {primaryTimeRange ? (
              <Text
                style={[
                  styles.meHeroDetailText,
                  isMuted && styles.meHeroDetailTextMuted,
                ]}
              >
                {primaryTimeRange}
              </Text>
            ) : null}
            {primarySegment?.displayFocusAreaName ? (
              <Text
                style={[
                  styles.meHeroDetailText,
                  isMuted && styles.meHeroDetailTextMuted,
                ]}
              >
                {primarySegment.displayFocusAreaName}
              </Text>
            ) : null}
          </View>
        )}

        {progress ? (
          <View style={styles.meHeroProgressBlock}>
            <View style={styles.meHeroProgressRow}>
              <Text style={styles.meHeroProgressLabel}>Progress</Text>
              <Text style={styles.meHeroProgressLabel}>
                {progress.remainingLabel}
              </Text>
            </View>
            <View style={styles.meHeroProgressTrack}>
              <View
                style={[
                  styles.meHeroProgressFill,
                  { width: `${Math.max(progress.progress, 0.08) * 100}%` },
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.meHeroCard, isMuted && styles.meHeroCardMuted]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.meHeroCard,
        isMuted && styles.meHeroCardMuted,
        pressed && styles.meHeroCardPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function MeCollaboratorsCard({
  canViewTeamSchedule,
  collaborators,
  entry,
  isLoading,
  hasError,
}: {
  canViewTeamSchedule: boolean;
  collaborators: MobileScheduleEntry[];
  entry: MobileScheduleEntry | null;
  isLoading: boolean;
  hasError: boolean;
}) {
  let body: string | null = null;

  if (!entry) {
    body = "Teammates will appear here once a shift is on the board.";
  } else if (entry.absenceTypeId != null) {
    body = "There are no on-duty teammates attached to an absence entry.";
  } else if (!canViewTeamSchedule) {
    body = "Team visibility is unavailable for this mobile role.";
  } else if (isLoading) {
    body = "Loading teammates working in the same window.";
  } else if (hasError) {
    body = "We couldn't load teammates right now.";
  } else if (collaborators.length === 0) {
    body = "No other teammates overlap this shift yet.";
  }

  return (
    <View style={styles.meSectionBlock}>
      <View style={styles.meSectionHeader}>
        <Text style={styles.meSectionTitle}>Working with you</Text>
        <Text style={styles.meSectionCaption}>Same window</Text>
      </View>

      <View style={styles.meSurfaceCard}>
        {body ? (
          <Text style={styles.meSectionBody}>{body}</Text>
        ) : (
          <View style={styles.meCollaboratorList}>
            {collaborators.map((collaborator, index) => (
              <MeCollaboratorRow
                key={`${collaborator.employeeId}-${collaborator.date}`}
                collaborator={collaborator}
                isFirst={index === 0}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MeCollaboratorRow({
  collaborator,
  isFirst,
}: {
  collaborator: MobileScheduleEntry;
  isFirst: boolean;
}) {
  const avatarTone = getAvatarTone(collaborator.employeeId);

  return (
    <View
      style={[
        styles.meCollaboratorRow,
        !isFirst && styles.meCollaboratorRowBorder,
      ]}
    >
      <View
        style={[
          styles.meCollaboratorAvatar,
          {
            backgroundColor: avatarTone.backgroundColor,
            borderColor: avatarTone.borderColor,
          },
        ]}
      >
        <Text
          style={[
            styles.meCollaboratorAvatarText,
            { color: avatarTone.textColor },
          ]}
        >
          {getInitials(collaborator.employeeName)}
        </Text>
      </View>
      <View style={styles.meCollaboratorCopy}>
        <Text style={styles.meCollaboratorName}>
          {collaborator.employeeName}
        </Text>
        <ScheduleEntrySegmentList entry={collaborator} variant="compact" />
      </View>
    </View>
  );
}

function MeTimelineCard({
  sections,
  onPressEntry,
}: {
  sections: MeTimelineSection[];
  onPressEntry: (entry: MobileScheduleEntry) => void;
}) {
  return (
    <View style={styles.meSectionBlock}>
      <View style={styles.meSectionHeader}>
        <Text style={styles.meSectionTitle}>Up Next</Text>
        <Text style={styles.meSectionCaption}>Later this week</Text>
      </View>

      {sections.length === 0 ? (
        <View style={styles.meSurfaceCard}>
          <Text style={styles.meSectionBody}>
            Nothing else is scheduled for this week.
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {sections.map((section) => (
            <View key={section.date} style={styles.timelineSection}>
              <View style={styles.timelineSectionHeader}>
                <View style={styles.timelineDot} />
                <Text style={styles.timelineSectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.timelineSectionEntries}>
                {section.entries.map((entry) => (
                  <Pressable
                    key={getScheduleEntryKey(entry)}
                    accessibilityRole="button"
                    onPress={() => onPressEntry(entry)}
                    style={({ pressed }) => [
                      styles.timelineEntryCard,
                      pressed && styles.timelineEntryCardPressed,
                    ]}
                  >
                    <ScheduleEntrySegmentList entry={entry} variant="timeline" />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
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
  const customTimeRange = getScheduleEntryCustomTimeRange(entry);
  const baseTimeRange = getScheduleEntryBaseTimeRange(entry);
  const segments = getDisplaySegments(entry);
  const overrideTimeRange =
    customTimeRange &&
    customTimeRange !== (groupTimeRange ?? baseTimeRange ?? null)
      ? customTimeRange
      : null;
  const overrideShiftSummary = overrideTimeRange
    ? `${entry.shiftName} • ${overrideTimeRange}`
    : null;
  const avatarTone = getAvatarTone(entry.employeeId);

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
          style={[
            styles.teamMemberAvatarText,
            { color: avatarTone.textColor },
          ]}
        >
          {getInitials(entry.employeeName)}
        </Text>
      </View>
      <View style={styles.teamMemberCopy}>
        <Text style={styles.teamMemberName}>{entry.employeeName}</Text>
        {segments.length > 1 ? (
          <ScheduleEntrySegmentList entry={entry} variant="compact" />
        ) : overrideShiftSummary ? (
          <Text style={styles.teamMemberTimeOverride}>
            {overrideShiftSummary}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
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

function ScheduleEntrySegmentList({
  entry,
  variant,
}: {
  entry: MobileScheduleEntry;
  variant: "compact" | "hero" | "timeline";
}) {
  const segments = getScheduleEntrySegments(entry);

  return (
    <View
      style={
        variant === "hero"
          ? styles.heroSegmentList
          : variant === "timeline"
            ? styles.timelineSegmentList
            : styles.compactSegmentList
      }
    >
      {segments.map((segment, index) => {
        const timeRange = getScheduleEntrySegmentTimeRange(segment);

        return (
          <View
            key={`${segment.shiftName}-${index}`}
            style={[
              variant === "hero"
                ? styles.heroSegmentBlock
                : variant === "timeline"
                  ? styles.timelineSegmentBlock
                  : styles.compactSegmentBlock,
              index > 0 &&
                (variant === "hero"
                  ? styles.heroSegmentDivider
                  : variant === "timeline"
                    ? styles.timelineSegmentDivider
                    : styles.compactSegmentDivider),
            ]}
          >
            <Text
              style={
                variant === "hero"
                  ? styles.heroSegmentTitle
                  : variant === "timeline"
                    ? styles.timelineSegmentTitle
                    : styles.compactSegmentTitle
              }
            >
              {segment.shiftName}
            </Text>
            {timeRange ? (
              <Text
                style={
                  variant === "hero"
                    ? styles.heroSegmentMeta
                    : variant === "timeline"
                      ? styles.timelineSegmentMeta
                      : styles.compactSegmentMeta
                }
              >
                {timeRange}
              </Text>
            ) : null}
            {segment.displayFocusAreaName ? (
              <Text
                style={
                  variant === "hero"
                    ? styles.heroSegmentMeta
                    : variant === "timeline"
                      ? styles.timelineSegmentMeta
                      : styles.compactSegmentMeta
                }
              >
                {segment.displayFocusAreaName}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
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
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  meWeekNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    backgroundColor: mobileColors.surface,
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: mobileColors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 2,
  },
  meWeekNavigatorCopy: {
    flex: 1,
    gap: 4,
  },
  meWeekNavigatorTitle: {
    color: mobileColors.textPrimary,
    fontSize: 18,
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
  meHeroCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#1D4ED8",
    borderRadius: 30,
    padding: 24,
    minHeight: 250,
    shadowColor: "rgba(37, 99, 235, 0.28)",
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 4,
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
    gap: 20,
  },
  meHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  meHeroHeaderCopy: {
    flex: 1,
    gap: 10,
  },
  meHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: mobileRadii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  meHeroBadgeMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  meHeroBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  meHeroBadgeTextMuted: {
    color: mobileColors.textPrimary,
  },
  meHeroTitle: {
    color: mobileColors.textInverse,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
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
  meHeroActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  meHeroActionIconMuted: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  meHeroEmptyText: {
    color: "rgba(255, 255, 255, 0.84)",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  meHeroEmptyTextMuted: {
    color: mobileColors.textSecondary,
  },
  meHeroDetails: {
    gap: 8,
  },
  meHeroDetailText: {
    color: "rgba(255, 255, 255, 0.88)",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
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
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    fontWeight: "700",
  },
  meHeroProgressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.24)",
    overflow: "hidden",
  },
  meHeroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: mobileColors.textInverse,
  },
  meSectionBlock: {
    gap: 12,
  },
  meSectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  meSectionTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 21,
    fontWeight: "800",
  },
  meSectionCaption: {
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "700",
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
    fontSize: 15,
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
    fontSize: 16,
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
    fontSize: 22,
    fontWeight: "800",
    textAlign: "left",
    lineHeight: 28,
  },
  teamHeaderTitle: {
    color: mobileColors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
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
    fontSize: 18,
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
    gap: 20,
  },
  shiftGroupBlock: {
    gap: 18,
  },
  shiftGroupDivider: {
    height: 1,
    backgroundColor: mobileColors.borderSubtle,
  },
  shiftGroupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  shiftGroupTitle: {
    flex: 1,
    color: mobileColors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
  },
  weekDaySection: {
    gap: 12,
  },
  weekDayHeader: {
    gap: 4,
  },
  weekDayTitle: {
    color: mobileColors.textPrimary,
    fontSize: 19,
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
    borderRadius: mobileRadii.card,
    borderWidth: 1,
    borderColor: mobileColors.borderSubtle,
    paddingHorizontal: 18,
    paddingVertical: 4,
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
    gap: 12,
    paddingVertical: 14,
  },
  teamMemberRowBorder: {
    borderTopWidth: 1,
    borderTopColor: mobileColors.borderSubtle,
  },
  teamMemberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: mobileColors.brandSoft,
    borderWidth: 1,
    borderColor: mobileColors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  teamMemberAvatarText: {
    color: mobileColors.brand,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  teamMemberCopy: {
    flex: 1,
    gap: 6,
  },
  teamMemberName: {
    color: mobileColors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  teamMemberTimeOverride: {
    color: mobileColors.textMuted,
    fontSize: 13,
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
    color: mobileColors.textInverse,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 23,
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
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
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
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  entryMetaText: {
    color: mobileColors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
});

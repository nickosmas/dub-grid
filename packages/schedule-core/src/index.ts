import type {
  MobileFocusArea,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import {
  TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY,
  type ScheduleEntryLike,
  type MobileScheduleRange,
  type TimeRange,
  type ShiftTimeSourceLike,
  type ShiftRequestLike,
  type MobileScheduleSection,
  type MobileScheduleWeekDay,
  type MobileScheduleMonthDay,
  type TeamScheduleFocusAreaTab,
  type MobileScheduleTimeGroup,
  type MobileScheduleShiftGroup,
  type MeScheduleSegmentItem,
  type FeaturedMeScheduleSegment,
  type WeeklyHoursSummary,
  type MeShiftRequestSections,
  type AvailableShiftFeedItem,
  type AvailableShiftDateGroup,
  type AvailableOpenShiftFeed,
  type LegacyMobileShiftRequest,
} from "./types";

export * from "./types";
export * from "./coverage";
export * from "./coverage-assembly";
export * from "./requests-assembly";
export * from "./hours-assembly";
export * from "./pay-period";
export * from "./dates";
import {
  parseIsoDate,
  getScheduleWeekStartDate,
  getScheduleMonthStartDate,
  getScheduleMonthEndDate,
  getDaysBetweenIsoDates,
  getIsoDateInTimeZone,
  getCurrentTimeValueInTimeZone,
  addDaysToIsoDate,
  formatDate,
  formatScheduleDayLabel,
  formatScheduleSectionSubtitle,
  formatScheduleTimeRange,
  formatScheduleTimeValue,
} from "./dates";
export * from "./entry-accessors";
import {
  getScheduleEntryStartTime,
  getScheduleEntryEndTime,
  getScheduleEntryCustomStartTime,
  getScheduleEntryCustomEndTime,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryTitle,
  getScheduleEntryFocusAreaId,
  getScheduleEntryFocusAreaName,
  getScheduleEntryDisplayFocusAreaName,
  getScheduleEntrySegments,
  splitPipeParts,
  hasPipeParts,
} from "./entry-accessors";
export * from "./schedule-time";
import {
  getSortableTime,
  sortScheduleEntries,
  expandTimeRange,
  isTimeWithinRange,
  getRangeDurationMinutes,
  toShiftTimeRange,
  hasShiftStartedAtTimeRanges,
  hasShiftRequestStarted,
  subtractBreakMinutes,
  getSegmentScheduledMinutes,
  formatHoursLabel,
  toHoursValue,
  getEntrySegmentSortTime,
} from "./schedule-time";
export * from "./team-schedule";
export * from "./open-shifts";
import { getRequestSortTime } from "./open-shifts";

export function buildMeScheduleSegmentItems(
  entries: ReadonlyArray<ScheduleEntryLike>,
): MeScheduleSegmentItem[] {
  const items: MeScheduleSegmentItem[] = [];

  const orderedEntries = [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftTime = getSortableTime(
      getScheduleEntryStartTime(left) ?? getScheduleEntryCustomStartTime(left),
    );
    const rightTime = getSortableTime(
      getScheduleEntryStartTime(right) ?? getScheduleEntryCustomStartTime(right),
    );

    if (leftTime !== rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      return leftTime.localeCompare(rightTime);
    }

    return left.employeeName.localeCompare(right.employeeName);
  });

  for (const entry of orderedEntries) {
    const segments = getScheduleEntrySegments(entry);

    segments.forEach((segment, index) => {
      items.push({
        key: [
          entry.employeeId,
          entry.date,
          segment.shiftName,
          segment.jobId ?? "none",
          segment.startTime ?? "none",
          index,
        ].join(":"),
        date: entry.date,
        entry: entry as MobileScheduleEntry,
        segment,
      });
    });
  }

  return items.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftTime = getEntrySegmentSortTime(left.entry, left.segment);
    const rightTime = getEntrySegmentSortTime(right.entry, right.segment);

    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime);
    }

    return left.entry.employeeName.localeCompare(right.entry.employeeName);
  });
}

export function getFeaturedMeScheduleSegment(input: {
  currentTime: string;
  entries: ScheduleEntryLike[];
  rangeStartDate?: string;
  selectedDate: string;
  todayDate: string;
}): FeaturedMeScheduleSegment {
  const items = buildMeScheduleSegmentItems(input.entries);
  const selectedDayItems = items.filter((item) => item.date === input.selectedDate);

  if (input.rangeStartDate && input.rangeStartDate.localeCompare(input.todayDate) > 0) {
    const firstWeekItem =
      items.find((item) => getScheduleEntryAbsenceTypeId(item.entry) == null) ?? null;

    if (firstWeekItem) {
      return {
        item: firstWeekItem,
        status: "upcoming",
      };
    }

    return {
      item: null,
      status: "empty",
    };
  }

  if (input.selectedDate === input.todayDate) {
    const activeItem =
      selectedDayItems.find(
        (item) =>
          getScheduleEntryAbsenceTypeId(item.entry) == null &&
          isTimeWithinRange(
            item.segment.startTime ?? getScheduleEntryStartTime(item.entry),
            item.segment.endTime ?? getScheduleEntryEndTime(item.entry),
            input.currentTime,
          ),
      ) ?? null;

    if (activeItem) {
      return {
        item: activeItem,
        status: "active",
      };
    }

    const upcomingTodayItem =
      selectedDayItems.find((item) => {
        if (getScheduleEntryAbsenceTypeId(item.entry) != null) {
          return false;
        }

        return (
          getEntrySegmentSortTime(item.entry, item.segment).localeCompare(input.currentTime) > 0
        );
      }) ?? null;

    if (upcomingTodayItem) {
      return {
        item: upcomingTodayItem,
        status: "upcoming",
      };
    }

    const awayTodayItem =
      selectedDayItems.find((item) => getScheduleEntryAbsenceTypeId(item.entry) != null) ?? null;

    if (awayTodayItem) {
      return {
        item: awayTodayItem,
        status: "away",
      };
    }

    const nextItem = items.find((item) => item.date.localeCompare(input.selectedDate) > 0) ?? null;

    if (nextItem) {
      return {
        item: nextItem,
        status: getScheduleEntryAbsenceTypeId(nextItem.entry) != null ? "away" : "upcoming",
      };
    }

    const endedTodayItem = selectedDayItems[0] ?? null;

    if (endedTodayItem) {
      return {
        item: endedTodayItem,
        status: "scheduled",
      };
    }

    return {
      item: null,
      status: "empty",
    };
  }

  const selectedDayItem = selectedDayItems[0] ?? null;

  if (selectedDayItem) {
    return {
      item: selectedDayItem,
      status: getScheduleEntryAbsenceTypeId(selectedDayItem.entry) != null ? "away" : "scheduled",
    };
  }

  const nextItem = items.find((item) => item.date.localeCompare(input.selectedDate) > 0) ?? null;

  if (nextItem) {
    return {
      item: nextItem,
      status: getScheduleEntryAbsenceTypeId(nextItem.entry) != null ? "away" : "upcoming",
    };
  }

  return {
    item: null,
    status: "empty",
  };
}

export function buildUpcomingMeScheduleItems(input: {
  entries: ReadonlyArray<ScheduleEntryLike>;
  featuredItem: MeScheduleSegmentItem | null;
  selectedDate: string;
}): MeScheduleSegmentItem[] {
  return buildMeScheduleSegmentItems(input.entries);
}

export function buildMeShiftRequestSections(input: {
  linkedEmployeeId: string | null;
  requests: MobileShiftRequest[];
  now?: Date;
  timeZone?: string | null;
}): MeShiftRequestSections {
  if (!input.linkedEmployeeId) {
    return {
      openShiftRequests: [],
      coverRequests: [],
    };
  }

  const sortRequests = (left: MobileShiftRequest, right: MobileShiftRequest) => {
    if (left.requesterShiftDate !== right.requesterShiftDate) {
      return left.requesterShiftDate.localeCompare(right.requesterShiftDate);
    }

    return getRequestSortTime(left, "requester").localeCompare(
      getRequestSortTime(right, "requester"),
    );
  };

  const now = input.now ?? new Date();
  return {
    openShiftRequests: input.requests
      .filter(
        (request) =>
          request.status === "open" &&
          request.type === "pickup" &&
          request.requesterEmpId !== input.linkedEmployeeId &&
          !hasShiftRequestStarted(request, now, input.timeZone),
      )
      .sort(sortRequests),
    coverRequests: input.requests
      .filter(
        (request) =>
          request.status === "open" &&
          request.targetEmpId === input.linkedEmployeeId &&
          !hasShiftRequestStarted(request, now, input.timeZone),
      )
      .sort(sortRequests),
  };
}

export function buildWeeklyHoursSummary(
  entries: ReadonlyArray<ScheduleEntryLike>,
  targetHours = 40,
): WeeklyHoursSummary {
  const scheduledMinutes = entries.reduce((total, entry) => {
    if (getScheduleEntryAbsenceTypeId(entry) != null) {
      return total;
    }

    const segments = getScheduleEntrySegments(entry);
    const customStartTime = getScheduleEntryCustomStartTime(entry);
    const customEndTime = getScheduleEntryCustomEndTime(entry);

    if (
      customStartTime &&
      customEndTime &&
      !hasPipeParts(customStartTime) &&
      !hasPipeParts(customEndTime)
    ) {
      return (
        total +
        subtractBreakMinutes(
          getRangeDurationMinutes(customStartTime, customEndTime),
          segments[0]?.breakMinutes,
        )
      );
    }

    const customStartTimes = splitPipeParts(customStartTime);
    const customEndTimes = splitPipeParts(customEndTime);

    return (
      total +
      segments.reduce(
        (segmentTotal, segment, index) =>
          segmentTotal +
          getSegmentScheduledMinutes(
            entry,
            segment,
            customStartTimes[index] ?? null,
            customEndTimes[index] ?? null,
          ),
        0,
      )
    );
  }, 0);

  const scheduledHours = toHoursValue(scheduledMinutes);
  const progress = targetHours > 0 ? Math.min(scheduledHours / targetHours, 1) : 0;
  const statusLabel =
    progress >= 0.8 ? "On track" : progress >= 0.5 ? "In progress" : "Needs attention";

  return {
    scheduledHours,
    targetHours,
    progress,
    statusLabel,
  };
}

export function buildScheduleTimeGroups(
  entries: ReadonlyArray<ScheduleEntryLike>,
): MobileScheduleTimeGroup[] {
  const grouped = new Map<
    string,
    {
      title: string;
      sortKey: string;
      entries: MobileScheduleEntry[];
    }
  >();

  const sortedEntries = sortScheduleEntries(entries);

  for (const entry of sortedEntries) {
    const sortTime = getSortableTime(
      getScheduleEntryStartTime(entry) ?? getScheduleEntryCustomStartTime(entry),
    );
    const key = sortTime ?? "unscheduled";
    const title = sortTime ? formatScheduleTimeValue(sortTime) : "Unscheduled";
    const group = grouped.get(key) ?? {
      title,
      sortKey: sortTime ?? "99:99:99",
      entries: [],
    };
    group.entries.push(entry as MobileScheduleEntry);
    grouped.set(key, group);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[1].sortKey.localeCompare(right[1].sortKey))
    .map(([key, value]) => ({
      key,
      title: value.title,
      entries: value.entries,
    }));
}

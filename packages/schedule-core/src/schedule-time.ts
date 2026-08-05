import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";
import {
  type MobileScheduleMonthDay,
  type MobileScheduleRange,
  type MobileScheduleWeekDay,
  type ScheduleEntryLike,
  type ShiftRequestLike,
  type ShiftTimeSourceLike,
  type TimeRange,
} from "./types";
import {
  addDaysToIsoDate,
  formatDate,
  getCurrentTimeValueInTimeZone,
  getDaysBetweenIsoDates,
  getIsoDateInTimeZone,
  getScheduleMonthEndDate,
  getScheduleMonthStartDate,
  getScheduleWeekStartDate,
  parseIsoDate,
} from "./dates";
import {
  getScheduleEntryCustomStartTime,
  getScheduleEntryDisplayFocusAreaName,
  getScheduleEntryEndTime,
  getScheduleEntryFocusAreaName,
  getScheduleEntryStartTime,
  splitPipeParts,
} from "./entry-accessors";

export function getSortableTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.split("|")[0]?.trim() ?? null;
}

export function sortScheduleEntries(
  entries: ReadonlyArray<ScheduleEntryLike>,
): MobileScheduleEntry[] {
  return [...entries].sort((left, right) => {
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
  }) as MobileScheduleEntry[];
}

export function buildScheduleWeekDays(
  range: MobileScheduleRange,
  selectedDate: string,
  timeZone?: string | null,
  today = new Date(),
): MobileScheduleWeekDay[] {
  const isoToday = getIsoDateInTimeZone(today, timeZone);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToIsoDate(range.startDate, index);

    return {
      date,
      weekdayLabel: formatDate(date, { weekday: "short" }, timeZone),
      dayLabel: formatDate(date, { day: "numeric" }, timeZone),
      isToday: date === isoToday,
      isSelected: date === selectedDate,
    };
  });
}

export function buildScheduleMonthDays(
  monthAnchorDate: string,
  selectedDate: string,
  timeZone?: string | null,
  today = new Date(),
): MobileScheduleMonthDay[][] {
  const monthStartDate = getScheduleMonthStartDate(monthAnchorDate);
  const monthEndDate = getScheduleMonthEndDate(monthAnchorDate);
  const gridStartDate = getScheduleWeekStartDate(monthStartDate);
  const monthEndWeekday = parseIsoDate(monthEndDate).getUTCDay();
  const gridEndDate = addDaysToIsoDate(monthEndDate, 6 - monthEndWeekday);
  const isoToday = getIsoDateInTimeZone(today, timeZone);
  const totalDays = getDaysBetweenIsoDates(gridStartDate, gridEndDate) + 1;

  return Array.from({ length: totalDays / 7 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDaysToIsoDate(gridStartDate, weekIndex * 7 + dayIndex);

      return {
        date,
        dayLabel: formatDate(date, { day: "numeric" }, timeZone),
        isCurrentMonth: date >= monthStartDate && date <= monthEndDate,
        isToday: date === isoToday,
        isSelected: date === selectedDate,
      };
    }),
  );
}

export function getScheduleMonthWeekIndexForDate(
  monthAnchorDate: string,
  targetDate: string,
): number {
  const gridStartDate = getScheduleWeekStartDate(getScheduleMonthStartDate(monthAnchorDate));

  return Math.floor(getDaysBetweenIsoDates(gridStartDate, targetDate) / 7);
}

export function formatSchedulePillDateLabel(
  date: string,
  today = new Date(),
  timeZone?: string | null,
): string {
  const isoToday = getIsoDateInTimeZone(today, timeZone);

  if (date === isoToday) {
    return "Today";
  }

  if (date === addDaysToIsoDate(isoToday, 1)) {
    return "Tomorrow";
  }

  return formatDate(date, { weekday: "short", month: "short", day: "numeric" }, timeZone);
}

export function filterScheduleEntriesByDate(
  entries: ReadonlyArray<ScheduleEntryLike>,
  date: string,
): MobileScheduleEntry[] {
  return entries.filter((entry) => entry.date === date) as MobileScheduleEntry[];
}

export function getMinutesSinceMidnight(value: string): number | null {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function expandTimeRange(
  start: string | null,
  end: string | null,
): Array<{ start: number; end: number }> {
  const startMinutes = start ? getMinutesSinceMidnight(start) : null;
  const endMinutes = end ? getMinutesSinceMidnight(end) : null;

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

export function isTimeWithinRange(
  start: string | null,
  end: string | null,
  currentTime: string,
): boolean {
  const currentMinutes = getMinutesSinceMidnight(currentTime);

  if (currentMinutes == null) {
    return false;
  }

  return expandTimeRange(start, end).some(
    (range) => currentMinutes >= range.start && currentMinutes < range.end,
  );
}

export function getRangeDurationMinutes(start: string | null, end: string | null): number {
  return expandTimeRange(start, end).reduce(
    (total, range) => total + Math.max(range.end - range.start, 0),
    0,
  );
}

export function normalizeTimeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().slice(0, 5) ?? null;
  if (!normalized) return null;

  // Zero-pad single-digit hours ("7:00" -> "07:00") so lexical comparisons
  // and sorts against other HH:MM values (always zero-padded) are correct.
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return normalized;
  const [, hour, minute] = match;
  return `${hour.padStart(2, "0")}:${minute}`;
}

export function toShiftTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): TimeRange | null {
  const normalizedStart = normalizeTimeValue(start);
  const normalizedEnd = normalizeTimeValue(end);

  if (!normalizedStart || !normalizedEnd) {
    return null;
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

export function getShiftLikeTimeRanges(
  source: ShiftTimeSourceLike | null | undefined,
): TimeRange[] {
  if (!source) {
    return [];
  }

  const segmentRanges =
    source.segments?.flatMap((segment) => {
      const range = toShiftTimeRange(
        segment.startTime ?? segment.shiftStartTime ?? null,
        segment.endTime ?? segment.shiftEndTime ?? null,
      );
      return range ? [range] : [];
    }) ?? [];

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const explicitRange = toShiftTimeRange(source.startTime, source.endTime);
  if (explicitRange) {
    return [explicitRange];
  }

  const customStartParts = splitPipeParts(source.customStartTime);
  const customEndParts = splitPipeParts(source.customEndTime);
  const customRanges: TimeRange[] = [];

  for (
    let index = 0;
    index < Math.max(customStartParts.length, customEndParts.length);
    index += 1
  ) {
    const range = toShiftTimeRange(customStartParts[index] ?? null, customEndParts[index] ?? null);
    if (range) {
      customRanges.push(range);
    }
  }

  return customRanges;
}

export function hasShiftStartedAtTimeRanges(input: {
  shiftDate: string | null | undefined;
  timeRanges: ReadonlyArray<Pick<TimeRange, "start">>;
  now: Date;
  timeZone?: string | null;
}): boolean {
  if (!input.shiftDate) {
    return false;
  }

  const todayDate = getIsoDateInTimeZone(input.now, input.timeZone);
  if (input.shiftDate < todayDate) {
    return true;
  }
  if (input.shiftDate > todayDate) {
    return false;
  }

  const earliestStart =
    input.timeRanges
      .map((range) => normalizeTimeValue(range.start))
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  if (!earliestStart) {
    return true;
  }

  return getCurrentTimeValueInTimeZone(input.now, input.timeZone) >= earliestStart;
}

export function hasShiftLikeStarted(input: {
  shiftDate: string | null | undefined;
  source: ShiftTimeSourceLike | null | undefined;
  now: Date;
  timeZone?: string | null;
}): boolean {
  return hasShiftStartedAtTimeRanges({
    shiftDate: input.shiftDate,
    timeRanges: getShiftLikeTimeRanges(input.source),
    now: input.now,
    timeZone: input.timeZone,
  });
}

export function hasShiftRequestStarted(
  request: ShiftRequestLike,
  now: Date,
  timeZone?: string | null,
): boolean {
  const requesterStarted = hasShiftLikeStarted({
    shiftDate: request.requesterShiftDate,
    source: {
      segments: request.requesterPresentation?.segments ?? null,
      startTime: request.requesterPresentation?.startTime ?? null,
      endTime: request.requesterPresentation?.endTime ?? null,
      customStartTime:
        request.requesterState?.customStartTime ?? request.requesterCustomStartTime ?? null,
      customEndTime:
        request.requesterState?.customEndTime ?? request.requesterCustomEndTime ?? null,
    },
    now,
    timeZone,
  });

  if (request.type !== "swap") {
    return requesterStarted;
  }

  return (
    requesterStarted ||
    hasShiftLikeStarted({
      shiftDate: request.targetShiftDate ?? null,
      source: {
        segments: request.targetPresentation?.segments ?? null,
        startTime: request.targetPresentation?.startTime ?? null,
        endTime: request.targetPresentation?.endTime ?? null,
        customStartTime:
          request.targetState?.customStartTime ?? request.targetCustomStartTime ?? null,
        customEndTime: request.targetState?.customEndTime ?? request.targetCustomEndTime ?? null,
      },
      now,
      timeZone,
    })
  );
}

export function getDurationFieldMinutes(
  value: Pick<MobileScheduleEntrySegment, "defaultDurationHours" | "defaultDurationMinutes">,
): number {
  if (value.defaultDurationHours == null && value.defaultDurationMinutes == null) {
    return 0;
  }

  return Math.max((value.defaultDurationHours ?? 0) * 60 + (value.defaultDurationMinutes ?? 0), 0);
}

export function subtractBreakMinutes(
  minutes: number,
  breakMinutes: number | null | undefined,
): number {
  return Math.max(minutes - (breakMinutes ?? 0), 0);
}

export function getSegmentScheduledMinutes(
  entry: ScheduleEntryLike,
  segment: MobileScheduleEntrySegment,
  startOverride?: string | null,
  endOverride?: string | null,
): number {
  const rangeMinutes = getRangeDurationMinutes(
    startOverride ?? segment.startTime ?? getScheduleEntryStartTime(entry),
    endOverride ?? segment.endTime ?? getScheduleEntryEndTime(entry),
  );
  const minutes = rangeMinutes > 0 ? rangeMinutes : getDurationFieldMinutes(segment);

  return subtractBreakMinutes(minutes, segment.breakMinutes);
}

/** Convert a duration in minutes to hours, rounded to one decimal place. */
export function toHoursValue(totalMinutes: number): number {
  return Math.round((Math.max(totalMinutes, 0) / 60) * 10) / 10;
}

/**
 * Render an hours value for display: whole hours stay bare ("8"), fractional
 * hours get one decimal ("7.5"). Takes **hours**, not minutes — pair it with
 * `toHoursValue` when starting from a duration.
 */
export function formatHoursLabel(hours: number): string {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

export function getEntrySegmentSortTime(
  entry: ScheduleEntryLike,
  segment: MobileScheduleEntrySegment,
): string {
  return (
    segment.startTime ??
    getScheduleEntryStartTime(entry) ??
    getScheduleEntryCustomStartTime(entry) ??
    "99:99:99"
  );
}

export function getScheduleEntrySegmentFocusAreaName(
  entry: ScheduleEntryLike,
  segment: Pick<MobileScheduleEntrySegment, "displayFocusAreaName">,
): string | null {
  if ("displayFocusAreaName" in segment) {
    return segment.displayFocusAreaName ?? null;
  }

  return getScheduleEntryDisplayFocusAreaName(entry) ?? getScheduleEntryFocusAreaName(entry);
}

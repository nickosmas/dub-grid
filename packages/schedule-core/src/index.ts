import type {
  MobileFocusArea,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";

export * from "./coverage";
export * from "./pay-period";

export type ScheduleEntryLike = {
  employeeId: string;
  employeeName: string;
  employeeSeniority?: number | null;
  date: string;
  state?: MobileScheduleEntry["state"];
  presentation?: MobileScheduleEntry["presentation"];
  shiftIds?: ReadonlyArray<number | null>;
  jobIds?: ReadonlyArray<number>;
  shiftLabel?: string | null;
  assignmentLabel?: string | null;
  shiftName?: string;
  absenceTypeId?: number | null;
  focusAreaId?: number | null;
  focusAreaName?: string | null;
  displayFocusAreaName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
  segments?: ReadonlyArray<MobileScheduleEntrySegment>;
  publishedAt?: string | null;
  publishedByName?: string | null;
};

export const TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY = "all";

export type MobileScheduleRange = {
  startDate: string;
  endDate: string;
};

export type TimeRange = {
  start: string;
  end: string;
};

export type ShiftTimeSegmentLike = {
  startTime?: string | null;
  endTime?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
};

export type ShiftTimeSourceLike = {
  segments?: ReadonlyArray<ShiftTimeSegmentLike> | null;
  startTime?: string | null;
  endTime?: string | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
};

export type ShiftRequestLike = {
  type: string;
  requesterShiftDate: string | null | undefined;
  requesterPresentation?: ShiftTimeSourceLike | null;
  requesterState?: Pick<ShiftTimeSourceLike, "customStartTime" | "customEndTime"> | null;
  requesterCustomStartTime?: string | null;
  requesterCustomEndTime?: string | null;
  targetShiftDate?: string | null;
  targetPresentation?: ShiftTimeSourceLike | null;
  targetState?: Pick<ShiftTimeSourceLike, "customStartTime" | "customEndTime"> | null;
  targetCustomStartTime?: string | null;
  targetCustomEndTime?: string | null;
};

export type MobileScheduleSection = {
  date: string;
  title: string;
  subtitle: string;
  entries: MobileScheduleEntry[];
};

export type MobileScheduleWeekDay = {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  isSelected: boolean;
};

export type MobileScheduleMonthDay = {
  date: string;
  dayLabel: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

export type TeamScheduleFocusAreaTab = {
  key: string;
  label: string;
  count: number;
  focusAreaId: number | null | "all";
};

export type MobileScheduleTimeGroup = {
  key: string;
  title: string;
  entries: MobileScheduleEntry[];
};

export type MobileScheduleShiftGroup = {
  key: string;
  title: string;
  entries: MobileScheduleEntry[];
};

export type MeScheduleSegmentStatus = "active" | "upcoming" | "scheduled" | "away" | "empty";

export type MeScheduleSegmentItem = {
  key: string;
  date: string;
  entry: MobileScheduleEntry;
  segment: MobileScheduleEntrySegment;
};

export type FeaturedMeScheduleSegment = {
  item: MeScheduleSegmentItem | null;
  status: MeScheduleSegmentStatus;
};

export type WeeklyHoursSummary = {
  scheduledHours: number;
  targetHours: number;
  progress: number;
  statusLabel: string;
};

export type MeShiftRequestSections = {
  coverRequests: MobileShiftRequest[];
  openShiftRequests: MobileShiftRequest[];
};

export type AvailableShiftFeedItem =
  | {
      kind: "open_shift";
      key: string;
      date: string;
      openShift: MobileOpenShift;
    }
  | {
      kind: "request";
      key: string;
      date: string;
      request: MobileShiftRequest;
    };

export type AvailableShiftDateGroup = {
  date: string;
  itemCount: number;
  slotCount: number;
  items: AvailableShiftFeedItem[];
};

export type AvailableOpenShiftFeed = {
  groups: AvailableShiftDateGroup[];
  openShiftRequests: MobileShiftRequest[];
  openShifts: MobileOpenShift[];
  totalCount: number;
};

type LegacyMobileShiftRequest = MobileShiftRequest & {
  requesterCustomStartTime?: string | null;
  requesterCustomEndTime?: string | null;
  targetCustomStartTime?: string | null;
  targetCustomEndTime?: string | null;
};

function getAvailableShiftFeedItemSlotCount(item: AvailableShiftFeedItem): number {
  if (item.kind === "open_shift") {
    return Math.max(item.openShift.needed, 1);
  }

  return 1;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.start > a.end) {
    return (
      rangesOverlap({ start: a.start, end: "24:00" }, b) ||
      rangesOverlap({ start: "00:00", end: a.end }, b)
    );
  }
  if (b.start > b.end) {
    return (
      rangesOverlap(a, { start: b.start, end: "24:00" }) ||
      rangesOverlap(a, { start: "00:00", end: b.end })
    );
  }
  return a.start < b.end && b.start < a.end;
}

export function timesOverlap(a: TimeRange[], b: TimeRange[]): boolean {
  return a.some((r1) => b.some((r2) => rangesOverlap(r1, r2)));
}

function formatIsoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function formatCompactScheduleDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function getCompactScheduleDateParts(value: string): {
  weekdayLabel: string;
  dayLabel: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${value}T00:00:00.000Z`));

  return {
    weekdayLabel: (parts.find((part) => part.type === "weekday")?.value ?? "").toUpperCase(),
    dayLabel: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

export function getScheduleWeekStartDate(value: string): string {
  const date = parseIsoDate(value);
  return addDaysToIsoDate(value, -date.getUTCDay());
}

export function getScheduleMonthStartDate(value: string): string {
  const date = parseIsoDate(value);
  date.setUTCDate(1);
  return formatIsoDateUtc(date);
}

function getScheduleMonthEndDate(value: string): string {
  const date = parseIsoDate(getScheduleMonthStartDate(value));
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return formatIsoDateUtc(date);
}

export function addMonthsToIsoDate(value: string, months: number): string {
  const date = parseIsoDate(value);
  const originalDay = date.getUTCDate();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return formatIsoDateUtc(date);
}

export function getDaysBetweenIsoDates(startDate: string, endDate: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) / millisecondsPerDay,
  );
}

function getDatePartsInTimeZone(
  value: Date,
  timeZone?: string | null,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return {
    year,
    month,
    day,
  };
}

export function getIsoDateInTimeZone(value: Date, timeZone?: string | null): string {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
}

export function getCurrentTimeValueInTimeZone(value: Date, timeZone?: string | null): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function addDaysToIsoDate(value: string, days: number): string {
  const next = parseIsoDate(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
  _timeZone?: string | null,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(parseIsoDate(value));
}

export function getScheduleRange(
  offsetWeeks: number,
  timeZone?: string | null,
  baseDate = new Date(),
): MobileScheduleRange {
  const anchorDate = addDaysToIsoDate(getIsoDateInTimeZone(baseDate, timeZone), offsetWeeks * 7);
  const startDate = getScheduleWeekStartDate(anchorDate);

  return {
    startDate,
    endDate: addDaysToIsoDate(startDate, 6),
  };
}

export function getScheduleRangeForDate(date: string): MobileScheduleRange {
  const startDate = getScheduleWeekStartDate(date);

  return {
    startDate,
    endDate: addDaysToIsoDate(startDate, 6),
  };
}

export function formatScheduleRange(range: MobileScheduleRange, timeZone?: string | null): string {
  const start = formatDate(range.startDate, { month: "short", day: "numeric" }, timeZone);
  const end = formatDate(range.endDate, { month: "short", day: "numeric" }, timeZone);
  return `${start} - ${end}`;
}

export function formatScheduleDayLabel(
  date: string,
  today = new Date(),
  timeZone?: string | null,
): string {
  const isoToday = getIsoDateInTimeZone(today, timeZone);
  if (date === isoToday) {
    return `Today, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  if (date === addDaysToIsoDate(isoToday, -1)) {
    return `Yesterday, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  if (date === addDaysToIsoDate(isoToday, 1)) {
    return `Tomorrow, ${formatDate(date, { month: "short", day: "numeric" }, timeZone)}`;
  }

  return formatDate(date, { weekday: "short", month: "short", day: "numeric" }, timeZone);
}

export function formatScheduleSectionSubtitle(entryCount: number, scope: "mine" | "team"): string {
  if (scope === "team") {
    return `${entryCount} ${entryCount === 1 ? "assignment" : "assignments"}`;
  }
  return `${entryCount} ${entryCount === 1 ? "shift" : "shifts"}`;
}

export function formatScheduleTimeRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;

  return `${formatScheduleTimeValue(start)} - ${formatScheduleTimeValue(end)}`;
}

export function getScheduleEntryStartTime(entry: ScheduleEntryLike): string | null {
  return entry.presentation?.startTime ?? entry.startTime ?? null;
}

export function getScheduleEntryEndTime(entry: ScheduleEntryLike): string | null {
  return entry.presentation?.endTime ?? entry.endTime ?? null;
}

export function getScheduleEntryCustomStartTime(entry: ScheduleEntryLike): string | null {
  return entry.state?.customStartTime ?? entry.customStartTime ?? null;
}

export function getScheduleEntryCustomEndTime(entry: ScheduleEntryLike): string | null {
  return entry.state?.customEndTime ?? entry.customEndTime ?? null;
}

export function getScheduleEntryAbsenceTypeId(entry: ScheduleEntryLike): number | null {
  if (entry.state) {
    return entry.state.kind === "absence" ? entry.state.absenceTypeId : null;
  }

  return entry.absenceTypeId ?? null;
}

export function getScheduleEntryTitle(entry: ScheduleEntryLike): string {
  return (
    entry.presentation?.shiftName ??
    entry.presentation?.label ??
    entry.shiftName ??
    entry.shiftLabel ??
    "Shift"
  );
}

export function getScheduleEntryFocusAreaId(entry: ScheduleEntryLike): number | null {
  return entry.presentation?.focusAreaId ?? entry.focusAreaId ?? null;
}

export function getScheduleEntryFocusAreaName(entry: ScheduleEntryLike): string | null {
  return entry.presentation?.focusAreaName ?? entry.focusAreaName ?? null;
}

export function getScheduleEntryDisplayFocusAreaName(entry: ScheduleEntryLike): string | null {
  return entry.presentation?.displayFocusAreaName ?? entry.displayFocusAreaName ?? null;
}

export function getScheduleEntryBaseTimeRange(entry: ScheduleEntryLike): string | null {
  return formatScheduleTimeRange(getScheduleEntryStartTime(entry), getScheduleEntryEndTime(entry));
}

export function getScheduleEntrySegments(entry: ScheduleEntryLike): MobileScheduleEntrySegment[] {
  const presentationSegments = entry.presentation?.segments ?? [];
  if (presentationSegments.length > 0) {
    return [...presentationSegments];
  }

  if (entry.segments && entry.segments.length > 0) {
    return [...entry.segments];
  }

  return [
    {
      label: entry.presentation?.label ?? getScheduleEntryTitle(entry),
      shiftName: getScheduleEntryTitle(entry),
      startTime: getScheduleEntryStartTime(entry),
      endTime: getScheduleEntryEndTime(entry),
      displayFocusAreaName: getScheduleEntryDisplayFocusAreaName(entry),
    },
  ];
}

function getExplicitScheduleEntrySegmentCount(entry: ScheduleEntryLike): number {
  const presentationSegments = entry.presentation?.segments ?? [];
  if (presentationSegments.length > 0) {
    return presentationSegments.length;
  }

  if (entry.segments && entry.segments.length > 0) {
    return entry.segments.length;
  }

  if (entry.state?.kind === "worked" && entry.state.segments.length > 0) {
    return entry.state.segments.length;
  }

  return 0;
}

export function getScheduleEntryCustomTimeRange(entry: ScheduleEntryLike): string | null {
  const customStartTime = getScheduleEntryCustomStartTime(entry);
  const customEndTime = getScheduleEntryCustomEndTime(entry);

  if (hasPipeParts(customStartTime) || hasPipeParts(customEndTime)) {
    if (getExplicitScheduleEntrySegmentCount(entry) !== 1) {
      return null;
    }

    return formatScheduleTimeRange(
      splitPipeParts(customStartTime)[0] ?? null,
      splitPipeParts(customEndTime)[0] ?? null,
    );
  }

  return formatScheduleTimeRange(customStartTime, customEndTime);
}

export function getScheduleEntrySegmentTimeRange(
  segment: Pick<MobileScheduleEntrySegment, "startTime" | "endTime">,
): string | null {
  return formatScheduleTimeRange(segment.startTime, segment.endTime);
}

export function getScheduleEntrySegmentShiftTimeRange(
  segment: Pick<MobileScheduleEntrySegment, "shiftStartTime" | "shiftEndTime">,
): string | null {
  return formatScheduleTimeRange(segment.shiftStartTime ?? null, segment.shiftEndTime ?? null);
}

export function getScheduleEntryTimeRange(entry: ScheduleEntryLike): string | null {
  const customStartTime = getScheduleEntryCustomStartTime(entry);
  const customEndTime = getScheduleEntryCustomEndTime(entry);
  const hasPipeCustomTime = hasPipeParts(customStartTime) || hasPipeParts(customEndTime);
  const shouldUseSinglePipeSegment =
    hasPipeCustomTime && getExplicitScheduleEntrySegmentCount(entry) === 1;
  const resolvedCustomStartTime = shouldUseSinglePipeSegment
    ? (splitPipeParts(customStartTime)[0] ?? null)
    : customStartTime;
  const resolvedCustomEndTime = shouldUseSinglePipeSegment
    ? (splitPipeParts(customEndTime)[0] ?? null)
    : customEndTime;
  const shouldUseCustomTime = !hasPipeCustomTime || shouldUseSinglePipeSegment;

  return formatScheduleTimeRange(
    (shouldUseCustomTime ? resolvedCustomStartTime : null) ?? getScheduleEntryStartTime(entry),
    (shouldUseCustomTime ? resolvedCustomEndTime : null) ?? getScheduleEntryEndTime(entry),
  );
}

export function getScheduleShiftGroupTimeRange(
  entries: ReadonlyArray<ScheduleEntryLike>,
): string | null {
  for (const entry of entries) {
    for (const segment of getScheduleEntrySegments(entry)) {
      const shiftTimeRange = getScheduleEntrySegmentShiftTimeRange(segment);
      if (shiftTimeRange) {
        return shiftTimeRange;
      }
    }
  }

  for (const entry of entries) {
    const baseTimeRange = getScheduleEntryBaseTimeRange(entry);
    if (baseTimeRange) {
      return baseTimeRange;
    }
  }

  for (const entry of entries) {
    const customTimeRange = getScheduleEntryCustomTimeRange(entry);
    if (customTimeRange) {
      return customTimeRange;
    }
  }

  return null;
}

function getEntryResolvedSegmentTimeRange(entry: ScheduleEntryLike): string | null {
  const segmentsWithTime = getScheduleEntrySegments(entry).filter(
    (segment) => segment.startTime && segment.endTime,
  );
  const firstSegment = segmentsWithTime[0] ?? null;
  const lastSegment = segmentsWithTime[segmentsWithTime.length - 1] ?? null;

  if (!firstSegment || !lastSegment) {
    return null;
  }

  return formatScheduleTimeRange(firstSegment.startTime, lastSegment.endTime);
}

export function getScheduleEntryMemberTimeRange(
  entry: ScheduleEntryLike,
  groupTimeRange: string | null,
): string | null {
  const customTimeRange = getScheduleEntryCustomTimeRange(entry);
  if (customTimeRange && customTimeRange !== groupTimeRange) {
    return customTimeRange;
  }

  const segmentTimeRange =
    getEntryResolvedSegmentTimeRange(entry) ?? getScheduleEntryTimeRange(entry);
  if (segmentTimeRange && groupTimeRange && segmentTimeRange !== groupTimeRange) {
    return segmentTimeRange;
  }

  return null;
}

function getSortableTime(value: string | null): string | null {
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

export function formatScheduleTimeValue(value: string): string {
  const [rawHours, minutes] = value.split(":");
  const hours = Number(rawHours);
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutes} ${suffix}`;
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

function isTimeWithinRange(start: string | null, end: string | null, currentTime: string): boolean {
  const currentMinutes = getMinutesSinceMidnight(currentTime);

  if (currentMinutes == null) {
    return false;
  }

  return expandTimeRange(start, end).some(
    (range) => currentMinutes >= range.start && currentMinutes < range.end,
  );
}

function getRangeDurationMinutes(start: string | null, end: string | null): number {
  return expandTimeRange(start, end).reduce(
    (total, range) => total + Math.max(range.end - range.start, 0),
    0,
  );
}

function splitPipeParts(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasPipeParts(value: string | null | undefined): boolean {
  return Boolean(value?.includes("|"));
}

function normalizeTimeValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().slice(0, 5) ?? null;
  if (!normalized) return null;

  // Zero-pad single-digit hours ("7:00" -> "07:00") so lexical comparisons
  // and sorts against other HH:MM values (always zero-padded) are correct.
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return normalized;
  const [, hour, minute] = match;
  return `${hour.padStart(2, "0")}:${minute}`;
}

function toShiftTimeRange(
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

function getDurationFieldMinutes(
  value: Pick<MobileScheduleEntrySegment, "defaultDurationHours" | "defaultDurationMinutes">,
): number {
  if (value.defaultDurationHours == null && value.defaultDurationMinutes == null) {
    return 0;
  }

  return Math.max((value.defaultDurationHours ?? 0) * 60 + (value.defaultDurationMinutes ?? 0), 0);
}

function subtractBreakMinutes(minutes: number, breakMinutes: number | null | undefined): number {
  return Math.max(minutes - (breakMinutes ?? 0), 0);
}

function getSegmentScheduledMinutes(
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

function formatHoursValue(totalMinutes: number): number {
  return Math.round((Math.max(totalMinutes, 0) / 60) * 10) / 10;
}

function getEntrySegmentSortTime(
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

function getRequestPrimarySegment(
  request: MobileShiftRequest,
  which: "requester" | "target",
): MobileScheduleEntrySegment | null {
  const legacyRequest = request as MobileShiftRequest & {
    requesterSegments?: MobileShiftRequest["requesterPresentation"]["segments"];
    targetSegments?: MobileShiftRequest["requesterPresentation"]["segments"] | null;
  };
  const segments =
    which === "requester"
      ? (request.requesterPresentation?.segments ?? legacyRequest.requesterSegments ?? [])
      : (request.targetPresentation?.segments ?? legacyRequest.targetSegments ?? []);

  return segments[0] ?? null;
}

function getRequestSortTime(request: MobileShiftRequest, which: "requester" | "target"): string {
  const legacyRequest = request as LegacyMobileShiftRequest;
  const primarySegment = getRequestPrimarySegment(request, which);

  return (
    primarySegment?.startTime ??
    (which === "requester"
      ? (request.requesterState?.customStartTime ?? legacyRequest.requesterCustomStartTime)
      : (request.targetState?.customStartTime ?? legacyRequest.targetCustomStartTime)) ??
    "99:99:99"
  );
}

function getOpenShiftSortTime(openShift: MobileOpenShift): string {
  const primarySegment = openShift.presentation.segments[0] ?? null;

  return (
    primarySegment?.startTime ??
    openShift.presentation.startTime ??
    openShift.state.customStartTime ??
    "99:99:99"
  );
}

export function buildAvailableShiftDateGroups(input: {
  openShifts: ReadonlyArray<MobileOpenShift>;
  requests: ReadonlyArray<MobileShiftRequest>;
}): AvailableShiftDateGroup[] {
  const items = [
    ...input.openShifts.map((openShift, index) => ({
      kind: "open_shift" as const,
      key: openShift.id,
      date: openShift.date,
      openShift,
      sortTime: getOpenShiftSortTime(openShift),
      sourceIndex: index,
    })),
    ...input.requests.map((request, index) => ({
      kind: "request" as const,
      key: request.id,
      date: request.requesterShiftDate,
      request,
      sortTime: getRequestSortTime(request, "requester"),
      sourceIndex: input.openShifts.length + index,
    })),
  ].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    if (left.sortTime !== right.sortTime) {
      return left.sortTime.localeCompare(right.sortTime);
    }

    return left.sourceIndex - right.sourceIndex;
  });

  const groups: AvailableShiftDateGroup[] = [];

  for (const item of items) {
    const group = groups[groups.length - 1];
    const feedItem: AvailableShiftFeedItem =
      item.kind === "open_shift"
        ? {
            kind: item.kind,
            key: item.key,
            date: item.date,
            openShift: item.openShift,
          }
        : {
            kind: item.kind,
            key: item.key,
            date: item.date,
            request: item.request,
          };

    if (!group || group.date !== item.date) {
      groups.push({
        date: item.date,
        itemCount: 1,
        slotCount: getAvailableShiftFeedItemSlotCount(feedItem),
        items: [feedItem],
      });
      continue;
    }

    group.itemCount += 1;
    group.slotCount += getAvailableShiftFeedItemSlotCount(feedItem);
    group.items.push(feedItem);
  }

  return groups;
}

function getScheduleEntryAvailabilityTimeRanges(entry: MobileScheduleEntry): TimeRange[] {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return [];
  }

  const segmentRanges = getScheduleEntrySegments(entry).flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const customRange = toShiftTimeRange(
    getScheduleEntryCustomStartTime(entry),
    getScheduleEntryCustomEndTime(entry),
  );

  if (customRange) {
    return [customRange];
  }

  const baseRange = toShiftTimeRange(
    getScheduleEntryStartTime(entry),
    getScheduleEntryEndTime(entry),
  );

  return baseRange ? [baseRange] : [];
}

function getRequestAvailabilityTimeRanges(request: MobileShiftRequest): TimeRange[] {
  const legacyRequest = request as LegacyMobileShiftRequest;
  const segments = request.requesterPresentation?.segments ?? [];
  const segmentRanges = segments.flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toShiftTimeRange(
    request.requesterPresentation?.startTime ?? null,
    request.requesterPresentation?.endTime ?? null,
  );

  if (presentationRange) {
    return [presentationRange];
  }

  const stateRange = toShiftTimeRange(
    request.requesterState?.customStartTime ?? legacyRequest.requesterCustomStartTime,
    request.requesterState?.customEndTime ?? legacyRequest.requesterCustomEndTime,
  );

  return stateRange ? [stateRange] : [];
}

function getOpenShiftAvailabilityTimeRanges(openShift: MobileOpenShift): TimeRange[] {
  const segmentRanges = openShift.presentation.segments.flatMap((segment) => {
    const range = toShiftTimeRange(
      segment.startTime ?? segment.shiftStartTime ?? null,
      segment.endTime ?? segment.shiftEndTime ?? null,
    );
    return range ? [range] : [];
  });

  if (segmentRanges.length > 0) {
    return segmentRanges;
  }

  const presentationRange = toShiftTimeRange(
    openShift.presentation.startTime,
    openShift.presentation.endTime,
  );

  if (presentationRange) {
    return [presentationRange];
  }

  const stateRange = toShiftTimeRange(
    openShift.state.customStartTime,
    openShift.state.customEndTime,
  );

  return stateRange ? [stateRange] : [];
}

function availabilityRangesOverlap(
  left: ReadonlyArray<TimeRange>,
  right: ReadonlyArray<TimeRange>,
): boolean {
  return left.some((leftRange) =>
    right.some((rightRange) =>
      expandTimeRange(leftRange.start, leftRange.end).some((leftExpanded) =>
        expandTimeRange(rightRange.start, rightRange.end).some(
          (rightExpanded) =>
            leftExpanded.start < rightExpanded.end && rightExpanded.start < leftExpanded.end,
        ),
      ),
    ),
  );
}

function isPendingVolunteerRequest(
  request: MobileShiftRequest,
  linkedEmployeeId?: string | null,
): boolean {
  if (
    request.type !== "pickup" ||
    request.status !== "pending_approval" ||
    request.targetEmpId != null ||
    request.parentRequestId != null
  ) {
    return false;
  }

  return linkedEmployeeId == null || request.requesterEmpId === linkedEmployeeId;
}

function requestMatchesOpenShift(request: MobileShiftRequest, openShift: MobileOpenShift): boolean {
  if (request.requesterShiftDate !== openShift.date) {
    return false;
  }

  const requestFocusAreaId =
    request.requesterState.focusAreaId ??
    request.requesterPresentation?.focusAreaId ??
    request.requesterPresentation?.segments[0]?.focusAreaId ??
    null;

  if (requestFocusAreaId !== openShift.focusAreaId) {
    return false;
  }

  return request.requesterState.segments.some((requestSegment) =>
    openShift.state.segments.some(
      (openShiftSegment) =>
        requestSegment.jobId === openShiftSegment.jobId &&
        requestSegment.shiftId === openShiftSegment.shiftId,
    ),
  );
}

function buildScheduleAvailabilityRangesByDate(
  entries: ReadonlyArray<MobileScheduleEntry>,
): Map<string, TimeRange[]> {
  const rangesByDate = new Map<string, TimeRange[]>();

  for (const entry of entries) {
    const ranges = getScheduleEntryAvailabilityTimeRanges(entry);

    if (ranges.length === 0) {
      continue;
    }

    const currentRanges = rangesByDate.get(entry.date) ?? [];
    currentRanges.push(...ranges);
    rangesByDate.set(entry.date, currentRanges);
  }

  return rangesByDate;
}

/**
 * How an open-shift source is surfaced to a regular user. Mirrors
 * `OpenShiftVisibilityMode` from `@dubgrid/domain` (kept local so schedule-core
 * stays dependency-light). `matched` only shows shifts that fit the user's
 * availability; `always` shows them regardless; `hidden` shows none.
 */
export type OpenShiftFeedVisibilityMode = "hidden" | "matched" | "always";

export function buildAvailableOpenShiftFeed(input: {
  linkedEmployeeId: string | null;
  scheduleEntries: ReadonlyArray<MobileScheduleEntry>;
  openShifts: ReadonlyArray<MobileOpenShift>;
  requests: ReadonlyArray<MobileShiftRequest>;
  now?: Date;
  showAll?: boolean;
  timeZone?: string | null;
  /** Visibility of coverage-shortage open shifts. Defaults to `matched`. */
  coverageGapVisibility?: OpenShiftFeedVisibilityMode;
  /** Visibility of call-off (open pickup) vacancies. Defaults to `matched`. */
  calloffVisibility?: OpenShiftFeedVisibilityMode;
}): AvailableOpenShiftFeed {
  if (!input.linkedEmployeeId && !input.showAll) {
    return {
      groups: [],
      openShiftRequests: [],
      openShifts: [],
      totalCount: 0,
    };
  }

  const scheduleRangesByDate = buildScheduleAvailabilityRangesByDate(input.scheduleEntries);
  const now = input.now ?? new Date();
  const showAll = input.showAll ?? false;
  // The visibility policy governs the regular-user view only. When showAll is
  // set (a scheduler/admin viewing every open shift), it always wins.
  const coverageGapVisibility = input.coverageGapVisibility ?? "matched";
  const calloffVisibility = input.calloffVisibility ?? "matched";
  const pendingVolunteerRequests = input.requests.filter(
    (request) =>
      isPendingVolunteerRequest(request, input.linkedEmployeeId) &&
      !hasShiftRequestStarted(request, now, input.timeZone),
  );
  const openShiftRequests = input.requests
    .filter((request) => {
      if (
        request.type !== "pickup" ||
        request.status !== "open" ||
        (!showAll && request.requesterEmpId === input.linkedEmployeeId)
      ) {
        return false;
      }

      if (hasShiftRequestStarted(request, now, input.timeZone)) {
        return false;
      }

      if (!showAll && calloffVisibility === "hidden") {
        return false;
      }

      if (showAll || calloffVisibility === "always") {
        return true;
      }

      return !availabilityRangesOverlap(
        scheduleRangesByDate.get(request.requesterShiftDate) ?? [],
        getRequestAvailabilityTimeRanges(request),
      );
    })
    .concat(pendingVolunteerRequests);
  const openShifts = input.openShifts.flatMap((openShift) => {
    const hasOwnPendingVolunteer =
      input.linkedEmployeeId != null &&
      pendingVolunteerRequests.some((request) => requestMatchesOpenShift(request, openShift));

    if (hasOwnPendingVolunteer) {
      return [];
    }

    if (openShift.needed <= 0) {
      return [];
    }

    if (!showAll && coverageGapVisibility === "hidden") {
      return [];
    }

    if (!showAll && openShift.canVolunteer === false) {
      return [];
    }

    if (
      hasShiftStartedAtTimeRanges({
        shiftDate: openShift.date,
        timeRanges: getOpenShiftAvailabilityTimeRanges(openShift),
        now,
        timeZone: input.timeZone,
      })
    ) {
      return [];
    }

    if (showAll || coverageGapVisibility === "always") {
      return [openShift];
    }

    return availabilityRangesOverlap(
      scheduleRangesByDate.get(openShift.date) ?? [],
      getOpenShiftAvailabilityTimeRanges(openShift),
    )
      ? []
      : [openShift];
  });

  const groups = buildAvailableShiftDateGroups({
    openShifts,
    requests: openShiftRequests,
  });

  return {
    groups,
    openShiftRequests,
    openShifts,
    totalCount: groups.reduce((total, group) => total + group.slotCount, 0),
  };
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

  const scheduledHours = formatHoursValue(scheduledMinutes);
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

export function getScheduleEntryCategoryKey(entry: ScheduleEntryLike): string {
  const title = getScheduleEntryTitle(entry);

  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return `absence:${getScheduleEntryAbsenceTypeId(entry)}:${title}`;
  }

  const canonicalSegments = entry.state?.segments ?? [];
  const shiftIds =
    canonicalSegments.length > 0
      ? canonicalSegments.map((segment) =>
          segment.shiftId == null ? "null" : String(segment.shiftId),
        )
      : (entry.shiftIds ?? []).map((shiftId) => (shiftId == null ? "null" : String(shiftId)));
  if (shiftIds.some((shiftId) => shiftId !== "null")) {
    return `shift:${shiftIds.join(",")}`;
  }

  return `name:${title}`;
}

function getShiftOnlySegmentTitle(segment: MobileScheduleEntrySegment): string | null {
  const title = segment.shiftName ?? segment.label ?? null;
  const jobName = segment.jobName?.trim();

  if (!title) {
    return null;
  }

  if (jobName && title.endsWith(` ${jobName}`)) {
    return title.slice(0, -jobName.length).trim();
  }

  return title;
}

function getScheduleEntryPrimaryJobSort(entry: ScheduleEntryLike): {
  sortOrder: number;
  name: string;
} {
  const segment =
    getScheduleEntrySegments(entry).find((item) => item.jobName) ??
    getScheduleEntrySegments(entry)[0] ??
    null;

  return {
    sortOrder: segment?.jobSortOrder ?? Number.MAX_SAFE_INTEGER,
    name: segment?.jobName ?? "",
  };
}

function getScheduleEntrySeniority(entry: ScheduleEntryLike): number {
  return entry.employeeSeniority ?? Number.MAX_SAFE_INTEGER;
}

function sortTeamShiftGroupEntries(entries: MobileScheduleEntry[]): MobileScheduleEntry[] {
  return [...entries].sort((left, right) => {
    const leftJob = getScheduleEntryPrimaryJobSort(left);
    const rightJob = getScheduleEntryPrimaryJobSort(right);

    if (leftJob.sortOrder !== rightJob.sortOrder) {
      return leftJob.sortOrder - rightJob.sortOrder;
    }

    const jobComparison = leftJob.name.localeCompare(rightJob.name);
    if (jobComparison !== 0) {
      return jobComparison;
    }

    const seniorityComparison = getScheduleEntrySeniority(left) - getScheduleEntrySeniority(right);
    if (seniorityComparison !== 0) {
      return seniorityComparison;
    }

    return left.employeeName.localeCompare(right.employeeName);
  });
}

export function getScheduleEntryCategoryTitle(entry: ScheduleEntryLike): string {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return getScheduleEntryTitle(entry);
  }

  const shiftTitles = getScheduleEntrySegments(entry)
    .map(getShiftOnlySegmentTitle)
    .filter((title): title is string => Boolean(title))
    .filter((title, index, titles) => titles.indexOf(title) === index);

  return shiftTitles.length > 0 ? shiftTitles.join(" / ") : getScheduleEntryTitle(entry);
}

export function buildScheduleShiftGroups(
  entries: ReadonlyArray<ScheduleEntryLike>,
): MobileScheduleShiftGroup[] {
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
    const key = getScheduleEntryCategoryKey(entry);
    const sortTime =
      getSortableTime(getScheduleEntryStartTime(entry) ?? getScheduleEntryCustomStartTime(entry)) ??
      "99:99:99";
    const existing = grouped.get(key) ?? {
      title: getScheduleEntryCategoryTitle(entry),
      sortKey: sortTime,
      entries: [],
    };

    if (sortTime.localeCompare(existing.sortKey) < 0) {
      existing.sortKey = sortTime;
    }

    existing.entries.push(entry as MobileScheduleEntry);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => {
      const sortComparison = left[1].sortKey.localeCompare(right[1].sortKey);
      if (sortComparison !== 0) {
        return sortComparison;
      }

      return left[1].title.localeCompare(right[1].title);
    })
    .map(([key, value]) => ({
      key,
      title: value.title,
      entries: sortTeamShiftGroupEntries(value.entries),
    }));
}

export function buildTeamScheduleFocusAreaTabs(
  focusAreas: ReadonlyArray<MobileFocusArea>,
  entries: ReadonlyArray<ScheduleEntryLike>,
): TeamScheduleFocusAreaTab[] {
  if (entries.length === 0 && focusAreas.length === 0) {
    return [];
  }

  const focusAreasById = new Map<number, MobileFocusArea>();

  for (const focusArea of focusAreas) {
    focusAreasById.set(focusArea.id, focusArea);
  }

  for (const entry of entries) {
    const focusAreaId = getScheduleEntryFocusAreaId(entry);
    const focusAreaName = getScheduleEntryFocusAreaName(entry);
    if (focusAreaId != null && focusAreaName && !focusAreasById.has(focusAreaId)) {
      focusAreasById.set(focusAreaId, {
        id: focusAreaId,
        name: focusAreaName,
      });
    }
  }

  const tabs = Array.from(focusAreasById.values()).map((focusArea) => ({
    key: `focus-area:${focusArea.id}`,
    label: focusArea.name,
    count: entries.filter((entry) => getScheduleEntryFocusAreaId(entry) === focusArea.id).length,
    focusAreaId: focusArea.id,
  }));

  if (focusAreas.length > 0) {
    return tabs;
  }

  return tabs.filter((tab) => tab.count > 0);
}

export function filterTeamScheduleEntriesByFocusArea(
  entries: ReadonlyArray<ScheduleEntryLike>,
  activeTabKey: string,
): MobileScheduleEntry[] {
  // If no key or 'all', return all entries unfiltered
  if (activeTabKey === TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY) {
    return [...entries] as MobileScheduleEntry[];
  }

  const match = /^focus-area:(\d+)$/.exec(activeTabKey);
  if (!match) {
    return [...entries] as MobileScheduleEntry[];
  }

  const focusAreaId = Number(match[1]);
  return entries.filter(
    (entry) => getScheduleEntryFocusAreaId(entry) === focusAreaId,
  ) as MobileScheduleEntry[];
}

export function buildScheduleSections(
  entries: ReadonlyArray<ScheduleEntryLike>,
  scope: "mine" | "team",
  timeZone?: string | null,
): MobileScheduleSection[] {
  const grouped = new Map<string, MobileScheduleEntry[]>();

  for (const entry of [...entries].sort((left, right) => {
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
  })) {
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry as MobileScheduleEntry);
    grouped.set(entry.date, existing);
  }

  return Array.from(grouped.entries()).map(([date, groupedEntries]) => ({
    date,
    title: formatScheduleDayLabel(date, new Date(), timeZone),
    subtitle: formatScheduleSectionSubtitle(groupedEntries.length, scope),
    entries: groupedEntries,
  }));
}

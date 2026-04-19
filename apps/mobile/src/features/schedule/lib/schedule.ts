import type {
  MobileFocusArea,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
} from "@dubgrid/contracts";

export const TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY = "all";

export type MobileScheduleRange = {
  startDate: string;
  endDate: string;
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

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDateUtc(value: Date): string {
  return value.toISOString().slice(0, 10);
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
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) /
      millisecondsPerDay,
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
  const month = Number(
    parts.find((part) => part.type === "month")?.value ?? "0",
  );
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return {
    year,
    month,
    day,
  };
}

export function getIsoDateInTimeZone(
  value: Date,
  timeZone?: string | null,
): string {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return `${parts.year}-${`${parts.month}`.padStart(2, "0")}-${`${parts.day}`.padStart(2, "0")}`;
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
  const anchorDate = addDaysToIsoDate(
    getIsoDateInTimeZone(baseDate, timeZone),
    offsetWeeks * 7,
  );
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

export function formatScheduleRange(
  range: MobileScheduleRange,
  timeZone?: string | null,
): string {
  const start = formatDate(
    range.startDate,
    { month: "short", day: "numeric" },
    timeZone,
  );
  const end = formatDate(
    range.endDate,
    { month: "short", day: "numeric" },
    timeZone,
  );
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

  return formatDate(
    date,
    { weekday: "short", month: "short", day: "numeric" },
    timeZone,
  );
}

export function formatScheduleSectionSubtitle(
  entryCount: number,
  scope: "mine" | "team",
): string {
  if (scope === "team") {
    return `${entryCount} ${entryCount === 1 ? "assignment" : "assignments"}`;
  }
  return `${entryCount} ${entryCount === 1 ? "shift" : "shifts"}`;
}

export function formatScheduleTimeRange(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;

  return `${formatScheduleTimeValue(start)} - ${formatScheduleTimeValue(end)}`;
}

export function getScheduleEntryBaseTimeRange(
  entry: Pick<MobileScheduleEntry, "startTime" | "endTime">,
): string | null {
  return formatScheduleTimeRange(entry.startTime, entry.endTime);
}

export function getScheduleEntrySegments(
  entry: Pick<
    MobileScheduleEntry,
    | "displayFocusAreaName"
    | "endTime"
    | "segments"
    | "shiftName"
    | "startTime"
  >,
): MobileScheduleEntrySegment[] {
  if (entry.segments && entry.segments.length > 0) {
    return entry.segments;
  }

  return [
    {
      shiftName: entry.shiftName,
      startTime: entry.startTime,
      endTime: entry.endTime,
      displayFocusAreaName: entry.displayFocusAreaName ?? null,
    },
  ];
}

export function getScheduleEntryCustomTimeRange(
  entry: Pick<MobileScheduleEntry, "customStartTime" | "customEndTime">,
): string | null {
  return formatScheduleTimeRange(entry.customStartTime, entry.customEndTime);
}

export function getScheduleEntrySegmentTimeRange(
  segment: Pick<MobileScheduleEntrySegment, "startTime" | "endTime">,
): string | null {
  return formatScheduleTimeRange(segment.startTime, segment.endTime);
}

export function getScheduleEntryTimeRange(
  entry: Pick<
    MobileScheduleEntry,
    "startTime" | "endTime" | "customStartTime" | "customEndTime"
  >,
): string | null {
  return formatScheduleTimeRange(
    entry.customStartTime ?? entry.startTime,
    entry.customEndTime ?? entry.endTime,
  );
}

export function getScheduleShiftGroupTimeRange(
  entries: MobileScheduleEntry[],
): string | null {
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

function getSortableTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.split("|")[0]?.trim() ?? null;
}

export function sortScheduleEntries(
  entries: MobileScheduleEntry[],
): MobileScheduleEntry[] {
  return [...entries].sort((left, right) => {
    const leftTime = getSortableTime(left.startTime ?? left.customStartTime);
    const rightTime = getSortableTime(right.startTime ?? right.customStartTime);

    if (leftTime !== rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      return leftTime.localeCompare(rightTime);
    }

    return left.employeeName.localeCompare(right.employeeName);
  });
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

export function formatScheduleMonthLabel(
  date: string,
  timeZone?: string | null,
): string {
  return formatDate(date, { month: "long", year: "numeric" }, timeZone);
}

export function filterScheduleEntriesByDate(
  entries: MobileScheduleEntry[],
  date: string,
): MobileScheduleEntry[] {
  return entries.filter((entry) => entry.date === date);
}

export function buildScheduleTimeGroups(
  entries: MobileScheduleEntry[],
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
    const sortTime = getSortableTime(entry.startTime ?? entry.customStartTime);
    const key = sortTime ?? "unscheduled";
    const title = sortTime ? formatScheduleTimeValue(sortTime) : "Unscheduled";
    const group = grouped.get(key) ?? {
      title,
      sortKey: sortTime ?? "99:99:99",
      entries: [],
    };
    group.entries.push(entry);
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

export function getScheduleEntryCategoryKey(
  entry: MobileScheduleEntry,
): string {
  if (entry.absenceTypeId != null) {
    return `absence:${entry.absenceTypeId}:${entry.shiftName}`;
  }

  if (entry.shiftCodeIds.length > 0) {
    return `shift:${entry.shiftCodeIds.join(",")}:${entry.shiftName}`;
  }

  if (entry.shiftLabel) {
    return `label:${entry.shiftLabel}:${entry.shiftName}`;
  }

  return `name:${entry.shiftName}`;
}

export function getScheduleEntryCategoryTitle(
  entry: MobileScheduleEntry,
): string {
  return entry.shiftName;
}

export function buildScheduleShiftGroups(
  entries: MobileScheduleEntry[],
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
      getSortableTime(entry.startTime ?? entry.customStartTime) ?? "99:99:99";
    const existing = grouped.get(key) ?? {
      title: getScheduleEntryCategoryTitle(entry),
      sortKey: sortTime,
      entries: [],
    };

    if (sortTime.localeCompare(existing.sortKey) < 0) {
      existing.sortKey = sortTime;
    }

    existing.entries.push(entry);
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
      entries: value.entries,
    }));
}

export function buildTeamScheduleFocusAreaTabs(
  focusAreas: MobileFocusArea[],
  entries: MobileScheduleEntry[],
): TeamScheduleFocusAreaTab[] {
  if (entries.length === 0 && focusAreas.length === 0) {
    return [];
  }

  const focusAreasById = new Map<number, MobileFocusArea>();

  for (const focusArea of focusAreas) {
    focusAreasById.set(focusArea.id, focusArea);
  }

  for (const entry of entries) {
    if (
      entry.focusAreaId != null &&
      entry.focusAreaName &&
      !focusAreasById.has(entry.focusAreaId)
    ) {
      focusAreasById.set(entry.focusAreaId, {
        id: entry.focusAreaId,
        name: entry.focusAreaName,
      });
    }
  }

  const tabs = Array.from(focusAreasById.values())
    .map((focusArea) => ({
      key: `focus-area:${focusArea.id}`,
      label: focusArea.name,
      count: entries.filter((entry) => entry.focusAreaId === focusArea.id)
        .length,
      focusAreaId: focusArea.id,
    }));

  if (focusAreas.length > 0) {
    return tabs;
  }

  return tabs.filter((tab) => tab.count > 0);
}

export function filterTeamScheduleEntriesByFocusArea(
  entries: MobileScheduleEntry[],
  activeTabKey: string,
): MobileScheduleEntry[] {
  // If no key or 'all', return all entries unfiltered
  if (activeTabKey === TEAM_SCHEDULE_ALL_FOCUS_AREAS_KEY) {
    return entries;
  }

  const match = /^focus-area:(\d+)$/.exec(activeTabKey);
  if (!match) {
    return entries;
  }

  const focusAreaId = Number(match[1]);
  return entries.filter((entry) => entry.focusAreaId === focusAreaId);
}

export function buildScheduleSections(
  entries: MobileScheduleEntry[],
  scope: "mine" | "team",
  timeZone?: string | null,
): MobileScheduleSection[] {
  const grouped = new Map<string, MobileScheduleEntry[]>();

  for (const entry of [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftTime = getSortableTime(left.startTime ?? left.customStartTime);
    const rightTime = getSortableTime(right.startTime ?? right.customStartTime);
    if (leftTime !== rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      return leftTime.localeCompare(rightTime);
    }

    return left.employeeName.localeCompare(right.employeeName);
  })) {
    const existing = grouped.get(entry.date) ?? [];
    existing.push(entry);
    grouped.set(entry.date, existing);
  }

  return Array.from(grouped.entries()).map(([date, groupedEntries]) => ({
    date,
    title: formatScheduleDayLabel(date, new Date(), timeZone),
    subtitle: formatScheduleSectionSubtitle(groupedEntries.length, scope),
    entries: groupedEntries,
  }));
}

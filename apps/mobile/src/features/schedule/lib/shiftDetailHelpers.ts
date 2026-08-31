import type {
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import {
  formatPublishedAt as formatPublishedAtShared,
  formatPublishedSummary as formatPublishedSummaryShared,
} from "@dubgrid/schedule-core";
import {
  doScheduleEntrySegmentsShareShiftAndFocusArea,
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryCategoryKey,
  getScheduleEntryCustomEndTime,
  getScheduleEntryCustomStartTime,
  getScheduleEntryEndTime,
  getScheduleEntrySegmentTimeRange,
  getScheduleEntrySegments,
  getScheduleEntryStartTime,
  getScheduleEntryTitle,
  getSplitShiftSegmentsForEntry,
  sortScheduleEntries,
} from "./schedule";

// Types and pure helpers for the shift-detail screen, extracted from
// ShiftDetailScreen.tsx so they are unit-testable and the screen file stays
// focused on stateful UI. Everything here must remain hookless and free of
// react-native imports beyond types.

export type RequestMode = "coverage" | "swap" | null;

export type ShiftTimeRange = {
  start: string;
  end: string;
};

export type ShiftmateSegmentMatch = {
  entry: MobileScheduleEntry;
  segment: MobileScheduleEntrySegment;
};

export type ShiftmateSegmentGroup = {
  key: string;
  label: string;
  title: string;
  timeRange: string | null;
  entries: ShiftmateSegmentMatch[];
};

export function readOptionalColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  return trimmedValue.toLowerCase() === "transparent" ? null : trimmedValue;
}

export function readOptionalStyleColor(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function formatShiftDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWeekDates(startDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDaysIso(startDate, index));
}

export function getDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const dates: string[] = [];
  for (
    let currentDate = startDate;
    currentDate <= endDate;
    currentDate = addDaysIso(currentDate, 1)
  ) {
    dates.push(currentDate);
  }

  return dates;
}

export function formatWeekRangeLabel(startDate: string): string {
  const formatRangeDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00.000Z`));

  return `${formatRangeDate(startDate)} - ${formatRangeDate(addDaysIso(startDate, 6))}`;
}

// Delegates to @dubgrid/schedule-core's canonical formatter — web's
// dashboard "schedule published" info now uses the exact same one.
export const formatPublishedAt = formatPublishedAtShared;
export const formatPublishedSummary = formatPublishedSummaryShared;

export function getSegmentSortTime(segment: MobileScheduleEntrySegment): string {
  return segment.startTime ?? segment.shiftStartTime ?? "99:99:99";
}

export function getSegmentTitle(segment: MobileScheduleEntrySegment): string {
  return segment.shiftName?.trim() || segment.label?.trim() || "Shift";
}

export function getSegmentTimeKey(segment: MobileScheduleEntrySegment): string {
  return `${segment.startTime ?? segment.shiftStartTime ?? ""}-${
    segment.endTime ?? segment.shiftEndTime ?? ""
  }`;
}

export function doShiftmateSegmentsMatch(
  sourceEntry: MobileScheduleEntry,
  sourceSegment: MobileScheduleEntrySegment,
  candidateEntry: MobileScheduleEntry,
  candidateSegment: MobileScheduleEntrySegment,
): boolean {
  return doScheduleEntrySegmentsShareShiftAndFocusArea(
    sourceEntry,
    sourceSegment,
    candidateEntry,
    candidateSegment,
  );
}

export function entriesHaveMatchingShiftAndFocusArea(
  sourceEntry: MobileScheduleEntry,
  candidateEntry: MobileScheduleEntry,
): boolean {
  const sourceSegments = getSortedEntrySegments(sourceEntry);
  const candidateSegments = getSortedEntrySegments(candidateEntry);

  return sourceSegments.some((sourceSegment) =>
    candidateSegments.some((candidateSegment) =>
      doShiftmateSegmentsMatch(sourceEntry, sourceSegment, candidateEntry, candidateSegment),
    ),
  );
}

export function isGeneralDetailEntry(entry: MobileScheduleEntry): boolean {
  const segments = getScheduleEntrySegments(entry);

  return segments.length > 0 && segments.every(isGeneralDetailSegment);
}

export function getSortedEntrySegments(entry: MobileScheduleEntry): MobileScheduleEntrySegment[] {
  return getScheduleEntrySegments(entry)
    .map((segment, originalIndex) => ({ segment, originalIndex }))
    .sort((left, right) => {
      const timeComparison = getSegmentSortTime(left.segment).localeCompare(
        getSegmentSortTime(right.segment),
      );

      return timeComparison === 0 ? left.originalIndex - right.originalIndex : timeComparison;
    })
    .map(({ segment }) => segment);
}

export function buildShiftmateSegmentGroups(
  shiftEntry: MobileScheduleEntry | null,
  teamEntries: ReadonlyArray<MobileScheduleEntry>,
): ShiftmateSegmentGroup[] {
  const splitSegments = shiftEntry ? getSplitShiftSegmentsForEntry(shiftEntry) : [];

  if (!shiftEntry || splitSegments.length <= 1) {
    return [];
  }

  const teammateEntries = sortScheduleEntries(
    teamEntries.filter(
      (entry) =>
        entry.date === shiftEntry.date &&
        entry.employeeId !== shiftEntry.employeeId &&
        getScheduleEntryAbsenceTypeId(entry) == null,
    ),
  );

  return splitSegments.map((sourceSegment, segmentIndex) => {
    const entries: ShiftmateSegmentMatch[] = [];

    for (const teammateEntry of teammateEntries) {
      const matchingSegment = getSortedEntrySegments(teammateEntry).find((candidateSegment) =>
        doShiftmateSegmentsMatch(shiftEntry, sourceSegment, teammateEntry, candidateSegment),
      );

      if (matchingSegment) {
        entries.push({
          entry: teammateEntry,
          segment: matchingSegment,
        });
      }
    }

    return {
      key: `${segmentIndex}-${getSegmentTitle(sourceSegment)}-${getSegmentTimeKey(sourceSegment)}`,
      label: `Shift ${segmentIndex + 1}`,
      title: getSegmentTitle(sourceSegment),
      timeRange: getScheduleEntrySegmentTimeRange(sourceSegment),
      entries,
    };
  });
}

export function getScheduleEntryIdentityKey(entry: MobileScheduleEntry): string {
  return [
    entry.employeeId,
    entry.date,
    getScheduleEntryCategoryKey(entry),
    getScheduleEntryStartTime(entry) ?? "none",
    getScheduleEntryEndTime(entry) ?? "none",
    getScheduleEntryCustomStartTime(entry) ?? "none",
    getScheduleEntryCustomEndTime(entry) ?? "none",
  ].join(":");
}

export function getActionSegmentOptions(entry: MobileScheduleEntry) {
  return getSortedEntrySegments(entry).map((segment, index) => ({ segment, segmentIndex: index }));
}

export function getActionSegmentLabel(entry: MobileScheduleEntry, segmentIndex: number): string {
  const options = getActionSegmentOptions(entry);
  const option = options[segmentIndex] ?? options[0] ?? null;

  if (!option) {
    return getScheduleEntryTitle(entry);
  }

  const title =
    option.segment.shiftName?.trim() ||
    option.segment.label?.trim() ||
    getScheduleEntryTitle(entry);
  const timeRange = getScheduleEntrySegmentTimeRange(option.segment);

  return timeRange ? `${title} (${timeRange})` : title;
}

export function getCurrentDateTimeParts(timeZone?: string | null): {
  dateKey: string;
  timeKey: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    timeKey: `${getPart("hour")}:${getPart("minute")}`,
  };
}

export function isPastScheduleDate(date: string, timeZone?: string | null): boolean {
  return date < getCurrentDateTimeParts(timeZone).dateKey;
}

export function formatShiftRequestStatus(status: MobileShiftRequest["status"]): string {
  return status === "pending_approval"
    ? "Pending approval"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatShiftRequestType(type: MobileShiftRequest["type"]): string {
  if (type === "pickup") {
    return "Pickup";
  }

  if (type === "swap") {
    return "Swap";
  }

  return "Calloff";
}

export function getRequestModeTitle(mode: RequestMode): string {
  if (mode === "coverage") {
    return "Drop shift";
  }

  if (mode === "swap") {
    return "Swap";
  }

  return "Shift action";
}

export function getAbsenceTypeOptionLabel(absenceType: { label: string; name?: string | null }) {
  const trimmedName = absenceType.name?.trim() ?? "";

  return trimmedName.length > 0 ? trimmedName : absenceType.label;
}

export function getAbsenceTypeLabelForEntry(
  absenceTypes: Array<{ id: number; label: string; name?: string | null }>,
  entry: MobileScheduleEntry,
) {
  const absenceTypeId = getScheduleEntryAbsenceTypeId(entry);
  const absenceType =
    absenceTypeId == null ? null : (absenceTypes.find((item) => item.id === absenceTypeId) ?? null);

  return absenceType ? getAbsenceTypeOptionLabel(absenceType) : getScheduleEntryTitle(entry);
}

export function getEntryTimeRanges(entry: MobileScheduleEntry): ShiftTimeRange[] {
  return getScheduleEntrySegments(entry).flatMap((segment) => {
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

export function hasWorkedAssignment(entry: MobileScheduleEntry): boolean {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return false;
  }

  return entry.state
    ? entry.state.kind === "worked" && entry.state.segments.length > 0
    : getScheduleEntrySegments(entry).length > 0;
}

export function hasScheduledWorkedAssignment(entry: MobileScheduleEntry): boolean {
  if (!hasWorkedAssignment(entry)) {
    return false;
  }

  if (entry.state) {
    return (
      entry.state.kind === "worked" &&
      entry.state.segments.length > 0 &&
      entry.state.segments.every((segment) => segment.shiftId != null)
    );
  }

  const segments = getScheduleEntrySegments(entry);
  if (segments.length === 0) {
    return true;
  }

  return segments.every(
    (segment) =>
      !Object.prototype.hasOwnProperty.call(segment, "shiftId") || segment.shiftId != null,
  );
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

export function expandTimeRange(range: ShiftTimeRange): Array<{ start: number; end: number }> {
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

export function entriesHaveOverlappingTimes(
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
      (rightRange) => leftRange.start < rightRange.end && rightRange.start < leftRange.end,
    ),
  );
}

export function getScheduleEntryRequiredFocusAreaIds(entry: MobileScheduleEntry): number[] {
  const focusAreaIds = new Set<number>();
  const presentationFocusAreaId = entry.presentation?.focusAreaId ?? null;

  if (presentationFocusAreaId != null) {
    focusAreaIds.add(presentationFocusAreaId);
  }

  for (const segment of entry.presentation?.segments ?? []) {
    const segmentFocusAreaId = segment.focusAreaId ?? null;
    if (segmentFocusAreaId != null) {
      focusAreaIds.add(segmentFocusAreaId);
    }
  }

  return [...focusAreaIds];
}

export function getEarliestScheduleEntryStartTime(entry: MobileScheduleEntry): string | null {
  let earliestStartTime = entry.presentation?.startTime ?? null;

  for (const segment of getScheduleEntrySegments(entry)) {
    if (segment.startTime && (!earliestStartTime || segment.startTime < earliestStartTime)) {
      earliestStartTime = segment.startTime;
    }
  }

  return earliestStartTime;
}

export function hasScheduleEntrySegmentStarted(
  entry: MobileScheduleEntry,
  timeZone: string | null | undefined,
  segmentIndex: number,
): boolean {
  const option = getActionSegmentOptions(entry)[segmentIndex];
  const startTime = option?.segment.startTime ?? option?.segment.shiftStartTime ?? null;

  const { dateKey: todayDateKey, timeKey: currentTimeKey } = getCurrentDateTimeParts(timeZone);

  if (entry.date < todayDateKey) {
    return true;
  }

  if (entry.date > todayDateKey) {
    return false;
  }

  if (!startTime) {
    return true;
  }

  const currentMinutes = getMinutesSinceMidnight(currentTimeKey);
  const startMinutes = getMinutesSinceMidnight(startTime);

  if (currentMinutes == null || startMinutes == null) {
    return true;
  }

  return currentMinutes >= startMinutes;
}

export function hasScheduleEntryStarted(
  entry: MobileScheduleEntry,
  timeZone?: string | null,
): boolean {
  const { dateKey: todayDateKey, timeKey: currentTimeKey } = getCurrentDateTimeParts(timeZone);

  if (entry.date < todayDateKey) {
    return true;
  }

  if (entry.date > todayDateKey) {
    return false;
  }

  const earliestStartTime = getEarliestScheduleEntryStartTime(entry);
  if (!earliestStartTime) {
    return true;
  }

  const currentMinutes = getMinutesSinceMidnight(currentTimeKey);
  const startMinutes = getMinutesSinceMidnight(earliestStartTime);

  if (currentMinutes == null || startMinutes == null) {
    return true;
  }

  return currentMinutes >= startMinutes;
}

export function hasAnyRequestableScheduleEntrySegment(
  entry: MobileScheduleEntry,
  timeZone?: string | null,
): boolean {
  const options = getActionSegmentOptions(entry);

  if (options.length === 0) {
    return false;
  }

  return options.some(
    (option) => !hasScheduleEntrySegmentStarted(entry, timeZone, option.segmentIndex),
  );
}

export function canWorkRequiredFocusAreas(
  employeeFocusAreaIds: ReadonlyArray<number> | null | undefined,
  requiredFocusAreaIds: ReadonlyArray<number>,
): boolean {
  if (requiredFocusAreaIds.length === 0) {
    return true;
  }

  const employeeFocusAreaIdSet = new Set(employeeFocusAreaIds ?? []);
  return requiredFocusAreaIds.every((focusAreaId) => employeeFocusAreaIdSet.has(focusAreaId));
}

export function getInitials(name: string): string {
  const parts = name.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "") : "";

  return `${first}${last}` || "?";
}

export function isGeneralDetailSegment(
  segment: { shiftId?: number | null } | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryDisplayFocusAreaName,
  getScheduleEntryFocusAreaId,
  getScheduleEntrySegmentFocusAreaName,
  getScheduleEntrySegments,
  type ScheduleEntryLike,
} from "@dubgrid/schedule-core";

export * from "@dubgrid/schedule-core";

type SplitShiftPresentationLike = {
  segments?: ReadonlyArray<MobileScheduleEntrySegment> | null;
};

type SplitShiftStateLike = {
  kind?: string | null;
} | null;

function isWorkedState(state: SplitShiftStateLike | undefined): boolean {
  return state == null || state.kind == null || state.kind === "worked";
}

function getSegmentSortTime(segment: MobileScheduleEntrySegment): string {
  return segment.startTime ?? segment.shiftStartTime ?? "99:99:99";
}

function sortSplitShiftSegments(
  segments: ReadonlyArray<MobileScheduleEntrySegment>,
): MobileScheduleEntrySegment[] {
  return segments
    .map((segment, index) => ({ index, segment }))
    .sort((left, right) => {
      const timeComparison = getSegmentSortTime(left.segment).localeCompare(
        getSegmentSortTime(right.segment),
      );

      return timeComparison === 0 ? left.index - right.index : timeComparison;
    })
    .map(({ segment }) => segment);
}

function getShiftmateSegmentTitle(segment: MobileScheduleEntrySegment): string {
  return segment.shiftName?.trim() || segment.label?.trim() || "Shift";
}

function getShiftmateSegmentTimeKey(segment: MobileScheduleEntrySegment): string {
  return `${segment.startTime ?? segment.shiftStartTime ?? ""}-${
    segment.endTime ?? segment.shiftEndTime ?? ""
  }`;
}

function normalizeShiftmateSegmentValue(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getSplitShiftSegmentsFromPresentation(
  presentation: SplitShiftPresentationLike | null | undefined,
  state?: SplitShiftStateLike,
): MobileScheduleEntrySegment[] {
  if (!isWorkedState(state)) {
    return [];
  }

  const segments = presentation?.segments ?? [];
  return segments.length > 1 ? sortSplitShiftSegments(segments) : [];
}

export function getSplitShiftSegmentsForEntry(
  entry: ScheduleEntryLike | MobileScheduleEntry | null | undefined,
): MobileScheduleEntrySegment[] {
  if (!entry || getScheduleEntryAbsenceTypeId(entry) != null) {
    return [];
  }

  if (!isWorkedState(entry.state)) {
    return [];
  }

  const presentationSegments = getSplitShiftSegmentsFromPresentation(
    entry.presentation,
    entry.state,
  );
  if (presentationSegments.length > 0) {
    return presentationSegments;
  }

  const segments = getScheduleEntrySegments(entry);
  return segments.length > 1 ? sortSplitShiftSegments(segments) : [];
}

export function getScheduleEntrySegmentFocusAreaId(
  entry: ScheduleEntryLike | MobileScheduleEntry,
  segment: Pick<MobileScheduleEntrySegment, "focusAreaId"> | null | undefined,
): number | null {
  if (segment && "focusAreaId" in segment) {
    return segment.focusAreaId ?? null;
  }

  return getScheduleEntryFocusAreaId(entry);
}

export function isGeneralScheduleEntrySegment(
  segment: Pick<MobileScheduleEntrySegment, "shiftId"> | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

export function getMobileScheduleEntryDisplayFocusAreaName(
  entry: ScheduleEntryLike | MobileScheduleEntry,
): string | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return null;
  }

  const segments = getScheduleEntrySegments(entry);
  return segments.some((segment) => !isGeneralScheduleEntrySegment(segment))
    ? getScheduleEntryDisplayFocusAreaName(entry)
    : null;
}

export function getMobileScheduleEntrySegmentFocusAreaName(
  entry: ScheduleEntryLike | MobileScheduleEntry,
  segment: MobileScheduleEntrySegment,
): string | null {
  if (getScheduleEntryAbsenceTypeId(entry) != null || isGeneralScheduleEntrySegment(segment)) {
    return null;
  }

  return getScheduleEntrySegmentFocusAreaName(entry, segment);
}

export function doScheduleEntrySegmentsShareShiftAndFocusArea(
  sourceEntry: ScheduleEntryLike | MobileScheduleEntry,
  sourceSegment: MobileScheduleEntrySegment,
  candidateEntry: ScheduleEntryLike | MobileScheduleEntry,
  candidateSegment: MobileScheduleEntrySegment,
): boolean {
  if (
    isGeneralScheduleEntrySegment(sourceSegment) ||
    isGeneralScheduleEntrySegment(candidateSegment)
  ) {
    return false;
  }

  if (
    getScheduleEntrySegmentFocusAreaId(sourceEntry, sourceSegment) !==
    getScheduleEntrySegmentFocusAreaId(candidateEntry, candidateSegment)
  ) {
    return false;
  }

  if (
    sourceSegment.shiftId != null &&
    candidateSegment.shiftId != null &&
    sourceSegment.shiftId === candidateSegment.shiftId
  ) {
    return true;
  }

  const sourceTitle = normalizeShiftmateSegmentValue(getShiftmateSegmentTitle(sourceSegment));
  const candidateTitle = normalizeShiftmateSegmentValue(getShiftmateSegmentTitle(candidateSegment));

  return (
    sourceTitle.length > 0 &&
    sourceTitle === candidateTitle &&
    getShiftmateSegmentTimeKey(sourceSegment) === getShiftmateSegmentTimeKey(candidateSegment)
  );
}

export function getSplitShiftBadgeLabel(count: number): string | null {
  return count > 1 ? `${count} shifts` : null;
}

export function getSplitShiftSegmentLabel(index: number, count: number): string {
  return count > 1 ? `Shift ${index + 1}` : "Shift";
}

/** The calendar's month title: "November", with the year only outside the current one. */
export function formatCalendarMonthTitle(monthStart: string, todayDate: string): string {
  const showYear = monthStart.slice(0, 4) !== todayDate.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    ...(showYear ? { year: "numeric" } : null),
    timeZone: "UTC",
  }).format(new Date(`${monthStart}T00:00:00.000Z`));
}

/** The dates the person works a shift, which the calendar marks with a dot; an absence alone isn't one. */
export function getScheduledDates(entries: ReadonlyArray<MobileScheduleEntry>): Set<string> {
  const dates = new Set<string>();
  for (const entry of entries) {
    if (entry.state.kind === "worked" && entry.state.segments.length > 0) dates.add(entry.date);
  }
  return dates;
}

const DOT_BLOCK_DAYS = 28;
// A Sunday, so every block starts on the first day of a calendar week.
const DOT_BLOCK_EPOCH = Date.UTC(2023, 0, 1);
const MS_PER_DAY = 86_400_000;

function isoDateAtDay(dayIndex: number): string {
  return new Date(DOT_BLOCK_EPOCH + dayIndex * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Four-week ranges covering `startDate` to `endDate`, on fixed boundaries so
 * the same block is fetched once and reused as the calendar moves. A month
 * grid can show 42 days and the schedule API answers at most 31 a request.
 */
export function getCalendarDotRanges(
  startDate: string,
  endDate: string,
): Array<{ startDate: string; endDate: string }> {
  const dayOf = (date: string) =>
    Math.floor((Date.parse(`${date}T00:00:00.000Z`) - DOT_BLOCK_EPOCH) / MS_PER_DAY);
  const firstBlock = Math.floor(dayOf(startDate) / DOT_BLOCK_DAYS);
  const lastBlock = Math.floor(dayOf(endDate) / DOT_BLOCK_DAYS);
  const ranges: Array<{ startDate: string; endDate: string }> = [];
  for (let block = firstBlock; block <= lastBlock; block++) {
    ranges.push({
      startDate: isoDateAtDay(block * DOT_BLOCK_DAYS),
      endDate: isoDateAtDay(block * DOT_BLOCK_DAYS + DOT_BLOCK_DAYS - 1),
    });
  }
  return ranges;
}

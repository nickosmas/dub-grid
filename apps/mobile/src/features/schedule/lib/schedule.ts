import type {
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
} from "@dubgrid/contracts";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryFocusAreaId,
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

function getShiftmateSegmentTitle(
  segment: MobileScheduleEntrySegment,
): string {
  return segment.shiftName?.trim() || segment.label?.trim() || "Shift";
}

function getShiftmateSegmentTimeKey(
  segment: MobileScheduleEntrySegment,
): string {
  return `${segment.startTime ?? segment.shiftStartTime ?? ""}-${
    segment.endTime ?? segment.shiftEndTime ?? ""
  }`;
}

function normalizeShiftmateSegmentValue(
  value: string | null | undefined,
): string {
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

  const sourceTitle = normalizeShiftmateSegmentValue(
    getShiftmateSegmentTitle(sourceSegment),
  );
  const candidateTitle = normalizeShiftmateSegmentValue(
    getShiftmateSegmentTitle(candidateSegment),
  );

  return (
    sourceTitle.length > 0 &&
    sourceTitle === candidateTitle &&
    getShiftmateSegmentTimeKey(sourceSegment) ===
      getShiftmateSegmentTimeKey(candidateSegment)
  );
}

function isGeneralScheduleEntrySegment(
  segment: Pick<MobileScheduleEntrySegment, "shiftId"> | null | undefined,
): boolean {
  return (
    segment != null &&
    Object.prototype.hasOwnProperty.call(segment, "shiftId") &&
    segment.shiftId === null
  );
}

export function getSplitShiftBadgeLabel(count: number): string | null {
  return count > 1 ? `${count} shifts` : null;
}

export function getSplitShiftSegmentLabel(index: number, count: number): string {
  return count > 1 ? `Shift ${index + 1}` : "Shift";
}

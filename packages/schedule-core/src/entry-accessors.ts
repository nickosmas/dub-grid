import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";
import type { ScheduleEntryLike, TimeRange, MobileScheduleShiftGroup } from "./types";
import { formatScheduleTimeRange } from "./dates";

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

export function splitPipeParts(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function hasPipeParts(value: string | null | undefined): boolean {
  return Boolean(value?.includes("|"));
}

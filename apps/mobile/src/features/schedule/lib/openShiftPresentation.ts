import type { MobileOpenShift } from "@dubgrid/contracts";
import { formatScheduleTimeRange } from "./schedule";

/**
 * Presentation accessors for an open shift, shared by the Schedule and
 * Requests tabs.
 *
 * These lived as private copies in both screens and drifted apart: the Requests
 * copy of `getOpenShiftTimeRange` fell back to the shift's custom times while
 * the Schedule copy returned null, so the same open shift showed a time range
 * on one tab and nothing on the other. The custom-time fallback is the correct
 * behaviour and is kept here.
 */

export function getOpenShiftPrimarySegment(openShift: MobileOpenShift) {
  return openShift.presentation.segments[0] ?? null;
}

export function getOpenShiftAbsenceTypeId(openShift: MobileOpenShift): number | null {
  return openShift.state.kind === "absence" ? (openShift.state.absenceTypeId ?? null) : null;
}

export function getOpenShiftFocusAreaName(openShift: MobileOpenShift): string | null {
  return (
    openShift.presentation.segments.find((segment) => segment.displayFocusAreaName)
      ?.displayFocusAreaName ??
    openShift.presentation.displayFocusAreaName ??
    openShift.focusAreaName
  );
}

export function getOpenShiftTimeRange(openShift: MobileOpenShift): string | null {
  const segment = openShift.presentation.segments.find((item) => item.startTime && item.endTime);

  if (segment?.startTime && segment.endTime) {
    return formatScheduleTimeRange(segment.startTime, segment.endTime);
  }

  if (openShift.presentation.startTime && openShift.presentation.endTime) {
    return formatScheduleTimeRange(
      openShift.presentation.startTime,
      openShift.presentation.endTime,
    );
  }

  if (!openShift.state.customStartTime || !openShift.state.customEndTime) {
    return null;
  }

  return formatScheduleTimeRange(openShift.state.customStartTime, openShift.state.customEndTime);
}

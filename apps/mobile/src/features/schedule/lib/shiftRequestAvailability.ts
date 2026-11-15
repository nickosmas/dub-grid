import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleEntryAbsenceTypeId } from "./schedule";
import {
  addDaysIso,
  getActionSegmentOptions,
  getCurrentDateTimeParts,
  getMinutesSinceMidnight,
  hasAnyRequestableScheduleEntrySegment,
  hasScheduledWorkedAssignment,
  hasWorkedAssignment,
} from "./shiftDetailHelpers";

export type ShiftRequestAvailability = {
  canDrop: boolean;
  canSwap: boolean;
  /** One line saying why an action is missing, or null when nothing needs saying. */
  notice: string | null;
  /** The check for an existing request failed, so the notice offers a retry. */
  canRetry: boolean;
};

export const SHIFT_REQUEST_NOTICES = {
  removed: "This shift was removed, so it can't be dropped or swapped.",
  absence: "You have an absence this day, so there's no shift to drop or swap.",
  started: "This shift has started, so it can't be dropped or swapped.",
  over: "This shift is over, so it can't be dropped or swapped.",
  checkFailed:
    "We couldn't check whether you already asked about this shift, so you can't drop or swap it yet.",
  generalShift: "A general shift can be dropped but not swapped.",
} as const;

const SILENT: ShiftRequestAvailability = {
  canDrop: false,
  canSwap: false,
  notice: null,
  canRetry: false,
};

function unavailable(notice: string, canRetry = false): ShiftRequestAvailability {
  return { canDrop: false, canSwap: false, notice, canRetry };
}

/**
 * Whether every shift in the cell has finished. An overnight shift ends the
 * next morning, so yesterday's night shift can still be under way today.
 * Without times the date decides.
 */
function hasEveryShiftEnded(entry: MobileScheduleEntry, timeZone?: string | null): boolean {
  const { dateKey: today, timeKey } = getCurrentDateTimeParts(timeZone);
  const nowMinutes = getMinutesSinceMidnight(timeKey);

  return getActionSegmentOptions(entry).every(({ segment }) => {
    const start = segment.startTime ?? segment.shiftStartTime ?? null;
    const end = segment.endTime ?? segment.shiftEndTime ?? null;
    const startMinutes = start ? getMinutesSinceMidnight(start) : null;
    const endMinutes = end ? getMinutesSinceMidnight(end) : null;

    if (startMinutes == null || endMinutes == null || nowMinutes == null) {
      return entry.date < today;
    }

    const endDate = endMinutes <= startMinutes ? addDaysIso(entry.date, 1) : entry.date;
    return endDate < today || (endDate === today && nowMinutes >= endMinutes);
  });
}

/**
 * Whether the viewer can drop or swap their own shift, and if not, why: the
 * buttons used to vanish with nothing in their place. A teammate's shift, a
 * request check still running and a request already under way say nothing
 * here, since the first has no actions to miss and the page shows the other
 * two.
 */
export function getShiftRequestAvailability(input: {
  entry: MobileScheduleEntry | null;
  linkedEmployeeId: string | null;
  timeZone: string | null | undefined;
  isCheckingExistingRequests: boolean;
  hasExistingRequestCheckError: boolean;
  hasActiveRequest: boolean;
}): ShiftRequestAvailability {
  const { entry, linkedEmployeeId, timeZone } = input;

  if (!entry || !linkedEmployeeId || entry.employeeId !== linkedEmployeeId) {
    return SILENT;
  }

  if (entry.change?.kind === "deleted" || entry.state?.kind === "deleted") {
    return unavailable(SHIFT_REQUEST_NOTICES.removed);
  }

  // A whole-day absence. An absence beside a shift (item 45) keeps the cell
  // worked, so its shifts can still be dropped and swapped.
  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return unavailable(SHIFT_REQUEST_NOTICES.absence);
  }

  if (!hasWorkedAssignment(entry) || getActionSegmentOptions(entry).length === 0) {
    return SILENT;
  }

  if (!hasAnyRequestableScheduleEntrySegment(entry, timeZone)) {
    return unavailable(
      hasEveryShiftEnded(entry, timeZone)
        ? SHIFT_REQUEST_NOTICES.over
        : SHIFT_REQUEST_NOTICES.started,
    );
  }

  if (input.isCheckingExistingRequests || input.hasActiveRequest) {
    return SILENT;
  }

  if (input.hasExistingRequestCheckError) {
    return unavailable(SHIFT_REQUEST_NOTICES.checkFailed, true);
  }

  // A general shift has no scheduled shift to trade, so only a drop applies.
  if (!hasScheduledWorkedAssignment(entry)) {
    return {
      canDrop: true,
      canSwap: false,
      notice: SHIFT_REQUEST_NOTICES.generalShift,
      canRetry: false,
    };
  }

  return { canDrop: true, canSwap: true, notice: null, canRetry: false };
}

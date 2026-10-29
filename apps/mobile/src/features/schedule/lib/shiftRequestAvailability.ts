import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleEntryAbsenceTypeId } from "./schedule";
import {
  getCurrentDateTimeParts,
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

const HIDDEN: ShiftRequestAvailability = {
  canDrop: false,
  canSwap: false,
  notice: null,
  canRetry: false,
};

function unavailable(notice: string, canRetry = false): ShiftRequestAvailability {
  return { canDrop: false, canSwap: false, notice, canRetry };
}

/**
 * Whether the viewer can drop or swap this shift, and if not, why. The
 * buttons used to vanish with nothing in their place, which read as a bug.
 * A teammate's shift, a check still running and a request already under way
 * say nothing here: the first has no actions to miss, and the other two
 * render their own state on the page.
 */
export function getShiftRequestAvailability(input: {
  entry: MobileScheduleEntry | null;
  linkedEmployeeId: string | null;
  timeZone: string | null | undefined;
  isCheckingExistingRequests: boolean;
  hasExistingRequestCheckError: boolean;
  hasActiveRequest: boolean;
}): ShiftRequestAvailability {
  const { entry, linkedEmployeeId } = input;

  if (!entry || !linkedEmployeeId || entry.employeeId !== linkedEmployeeId) {
    return HIDDEN;
  }

  if (entry.change?.kind === "deleted" || entry.state?.kind === "deleted") {
    return unavailable("This shift was removed, so it can't be dropped or swapped.");
  }

  if (getScheduleEntryAbsenceTypeId(entry) != null) {
    return unavailable("You're off this day, so there's no shift to drop or swap.");
  }

  if (!hasWorkedAssignment(entry)) {
    return HIDDEN;
  }

  if (!hasAnyRequestableScheduleEntrySegment(entry, input.timeZone)) {
    const isPast = entry.date < getCurrentDateTimeParts(input.timeZone).dateKey;
    return unavailable(
      isPast
        ? "This shift is over, so it can't be dropped or swapped."
        : "This shift has started, so it can't be dropped or swapped.",
    );
  }

  if (input.isCheckingExistingRequests || input.hasActiveRequest) {
    return HIDDEN;
  }

  if (input.hasExistingRequestCheckError) {
    return unavailable(
      "We couldn't check for an existing request on this shift, so drop and swap are off for now.",
      true,
    );
  }

  // A general shift has no scheduled shift to trade, so only a drop applies.
  if (!hasScheduledWorkedAssignment(entry)) {
    return {
      canDrop: true,
      canSwap: false,
      notice: "A general shift can be dropped but not swapped.",
      canRetry: false,
    };
  }

  return { canDrop: true, canSwap: true, notice: null, canRetry: false };
}

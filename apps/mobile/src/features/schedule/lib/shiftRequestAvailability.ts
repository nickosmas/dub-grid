import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getScheduleEntryAbsenceTypeId } from "./schedule";
import {
  getActionSegmentOptions,
  hasAnyRequestableScheduleEntrySegment,
  hasScheduledWorkedAssignment,
  hasWorkedAssignment,
} from "./shiftDetailHelpers";

export type ShiftRequestAvailability = {
  canDrop: boolean;
  canSwap: boolean;
  /** Shown only when the check for an existing request failed, beside a retry. */
  notice: string | null;
  /** The check for an existing request failed, so the notice offers a retry. */
  canRetry: boolean;
};

export const SHIFT_REQUEST_CHECK_FAILED_NOTICE = "We couldn't check your requests for this shift.";

const NONE: ShiftRequestAvailability = {
  canDrop: false,
  canSwap: false,
  notice: null,
  canRetry: false,
};

/**
 * Whether the viewer can drop or swap their own shift. When they can't, the
 * buttons are simply absent: the screen never explains why (owner,
 * 2026-11-17). The one exception is a failed request check, which needs a
 * way to try again.
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

  if (!entry || !linkedEmployeeId || entry.employeeId !== linkedEmployeeId) return NONE;
  if (entry.change?.kind === "deleted" || entry.state?.kind === "deleted") return NONE;
  // A whole-day absence. An absence beside a shift (item 45) keeps the cell
  // worked, so its shifts can still be dropped and swapped.
  if (getScheduleEntryAbsenceTypeId(entry) != null) return NONE;
  if (!hasWorkedAssignment(entry) || getActionSegmentOptions(entry).length === 0) return NONE;
  if (!hasAnyRequestableScheduleEntrySegment(entry, timeZone)) return NONE;
  if (input.isCheckingExistingRequests || input.hasActiveRequest) return NONE;

  if (input.hasExistingRequestCheckError) {
    return { ...NONE, notice: SHIFT_REQUEST_CHECK_FAILED_NOTICE, canRetry: true };
  }

  // A general shift has no scheduled shift to trade, so only a drop applies.
  return {
    canDrop: true,
    canSwap: hasScheduledWorkedAssignment(entry),
    notice: null,
    canRetry: false,
  };
}

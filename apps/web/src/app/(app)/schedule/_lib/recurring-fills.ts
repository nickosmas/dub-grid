import type { RecurringShift, ScheduleCellInput, ShiftMap } from "@/types";
import { hasVisibleGridShiftEntry } from "@/lib/schedule-logic";
import { iterateDateRange } from "@/lib/utils";

/** One empty cell a recurring schedule fills. */
export interface RecurringFill {
  employeeId: string;
  dateKey: string;
  input: ScheduleCellInput;
}

export interface RecurringFillInput {
  recurringShifts: ReadonlyArray<RecurringShift>;
  shifts: ShiftMap;
  startDate: Date;
  endDate: Date;
  activeShiftIds: ReadonlySet<number>;
  activeJobIds: ReadonlySet<number>;
  activeAbsenceTypeIds: ReadonlySet<number>;
  /** Only these people; everyone when omitted. */
  employeeIds?: ReadonlySet<string>;
}

function isStillActive(input: ScheduleCellInput, fill: RecurringFillInput): boolean {
  if (input.kind === "worked") {
    return input.segments.every(
      (segment) =>
        fill.activeJobIds.has(segment.jobId) &&
        (segment.shiftId == null || fill.activeShiftIds.has(segment.shiftId)),
    );
  }
  if (input.kind === "absence") {
    return input.absenceTypeId != null && fill.activeAbsenceTypeIds.has(input.absenceTypeId);
  }
  return false;
}

/**
 * The cells recurring schedules fill, by the server's own rule: only empty
 * cells, on the schedule's weekday, within its effective dates with the
 * latest start winning, and never from an archived shift, job or absence.
 */
export function planRecurringFills(fill: RecurringFillInput): RecurringFill[] {
  const byEmployee = new Map<string, RecurringShift[]>();
  for (const recurring of fill.recurringShifts) {
    if (fill.employeeIds && !fill.employeeIds.has(recurring.empId)) continue;
    byEmployee.set(recurring.empId, [...(byEmployee.get(recurring.empId) ?? []), recurring]);
  }
  const fills: RecurringFill[] = [];
  for (const { dateKey, dayOfWeek } of iterateDateRange(fill.startDate, fill.endDate)) {
    for (const [employeeId, schedules] of byEmployee) {
      if (hasVisibleGridShiftEntry(fill.shifts[`${employeeId}_${dateKey}`])) continue;
      const match = schedules
        .filter((schedule) => schedule.dayOfWeek === dayOfWeek)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
        .find(
          (schedule) =>
            schedule.effectiveFrom <= dateKey &&
            (!schedule.effectiveUntil || schedule.effectiveUntil >= dateKey),
        );
      if (match && isStillActive(match.input, fill)) {
        fills.push({ employeeId, dateKey, input: match.input });
      }
    }
  }
  return fills;
}

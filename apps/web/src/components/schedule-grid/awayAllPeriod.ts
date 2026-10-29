import { describeFirstDay, EMPLOYMENT_STATUS_LABELS, formatReturnDate } from "@dubgrid/domain";
import { formatLocalDateKey } from "@dubgrid/schedule-core";
import { awayRangeOf, gridAwayRange, isAwayOn, type AwayRange } from "./awayRuns";

export interface AwayAllPeriodInput {
  dateKeys: readonly string[];
  range: AwayRange | null;
  /** The whole-day absence on a day, or null. */
  absenceTypeIdOn: (dateKey: string) => number | null;
  /** How many shifts the day holds. */
  shiftCountOn: (dateKey: string) => number;
  dayOffAbsenceTypeId?: number | null;
  absenceName: (absenceTypeId: number) => string;
}

/**
 * Why someone is away for every day of the period on screen (item 54), or
 * null when any day isn't: each day is one of their away days (the Away,
 * Offboarded or Starts bar) or a whole-day absence other than the day off
 * absence, which on its own doesn't count.
 */
export function awayAllPeriodReason(input: AwayAllPeriodInput): string | null {
  if (input.dateKeys.length === 0) return null;
  const absences = new Set<number>();
  let rangeDays = 0;
  for (const dateKey of input.dateKeys) {
    if (input.range && isAwayOn(input.range, dateKey)) {
      rangeDays++;
      continue;
    }
    const absenceTypeId = input.absenceTypeIdOn(dateKey);
    if (
      absenceTypeId == null ||
      absenceTypeId === input.dayOffAbsenceTypeId ||
      input.shiftCountOn(dateKey) > 0
    ) {
      return null;
    }
    absences.add(absenceTypeId);
  }
  if (rangeDays > 0 && input.range) return rangeReason(input.range, input.dateKeys);
  if (absences.size === 1) return `${input.absenceName([...absences][0])} every day`;
  return "Absent every day";
}

function rangeReason(range: AwayRange, dateKeys: readonly string[]): string {
  if (range.firstDay && dateKeys.every((dateKey) => dateKey < (range.firstDay ?? ""))) {
    return describeFirstDay(range.firstDay);
  }
  if (range.lastDay) return EMPLOYMENT_STATUS_LABELS.removed;
  if (range.until) return `Away until ${formatReturnDate(range.until)}`;
  return EMPLOYMENT_STATUS_LABELS.inactive;
}

interface OrderInput {
  dates: readonly Date[];
  awayRanges?: ReadonlyMap<string, AwayRange>;
  /** False for a viewer who can't edit the schedule (see gridAwayRange). */
  isScheduleEditor?: boolean;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  dayOffAbsenceTypeId?: number | null;
  absenceName: (absenceTypeId: number) => string;
}

/** A section's people with anyone away for the whole period last, and why each is. */
export function orderAwayAllPeriod<T extends Parameters<typeof awayRangeOf>[0] & { id: string }>(
  employees: readonly T[],
  input: OrderInput,
): { employees: T[]; awayAllPeriod: Map<string, string> } {
  const days = input.dates.map((date) => ({ date, key: formatLocalDateKey(date) }));
  const dateOf = new Map(days.map((day) => [day.key, day.date]));
  const awayAllPeriod = new Map<string, string>();
  for (const employee of employees) {
    const why = awayAllPeriodReason({
      dateKeys: days.map((day) => day.key),
      range: gridAwayRange(employee, input.awayRanges, input.isScheduleEditor ?? true),
      absenceTypeIdOn: (key) => {
        const date = dateOf.get(key);
        return date ? (input.absenceTypeIdForKey?.(employee.id, date) ?? null) : null;
      },
      shiftCountOn: (key) => {
        const date = dateOf.get(key);
        return date ? (input.assignmentIdsForKey?.(employee.id, date).length ?? 0) : 0;
      },
      dayOffAbsenceTypeId: input.dayOffAbsenceTypeId,
      absenceName: input.absenceName,
    });
    if (why) awayAllPeriod.set(employee.id, why);
  }
  // With everyone away there is nobody to sit them below, so no group.
  if (awayAllPeriod.size === 0 || awayAllPeriod.size === employees.length) {
    return { employees: [...employees], awayAllPeriod: new Map() };
  }
  return {
    employees: [
      ...employees.filter((employee) => !awayAllPeriod.has(employee.id)),
      ...employees.filter((employee) => awayAllPeriod.has(employee.id)),
    ],
    awayAllPeriod,
  };
}

import { awayReturnDate } from "@/components/schedule-grid/awayRuns";
import type { Employee, ShiftMap } from "@/types";

/** Each Away person's first day back, by employee id; others are left out. */
export function awayUntilById(employees: readonly Employee[]): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const employee of employees) {
    const until = awayReturnDate(employee);
    if (until) result.set(employee.id, until);
  }
  return result;
}

/**
 * The cells coverage counts (51e): someone away until a date counts only from
 * that date, as before it they are not on the schedule at all. With nobody
 * away until a date it is `shifts` itself, so nothing recounts.
 */
export function withoutAwayDays(
  shifts: ShiftMap,
  awayUntil: ReadonlyMap<string, string>,
): ShiftMap {
  if (awayUntil.size === 0) return shifts;
  const result: ShiftMap = {};
  for (const [key, entry] of Object.entries(shifts)) {
    const split = key.lastIndexOf("_");
    const until = awayUntil.get(key.slice(0, split));
    if (until && key.slice(split + 1) < until) continue;
    result[key] = entry;
  }
  return result;
}

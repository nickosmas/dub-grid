import { awayRangeOf, isInAwayRange, type AwayRange } from "@/components/schedule-grid/awayRuns";
import type { Employee, ShiftMap } from "@/types";

export { isInAwayRange, type AwayRange };

/**
 * Each person's away days, by employee id: someone Away until a date (51e)
 * until then, and someone Active with an Away planned (51g1) from its start.
 * Everyone else is left out.
 */
export function awayRangesById(employees: readonly Employee[]): ReadonlyMap<string, AwayRange> {
  const result = new Map<string, AwayRange>();
  for (const employee of employees) {
    const range = awayRangeOf(employee);
    if (range) result.set(employee.id, range);
  }
  return result;
}

/**
 * The cells coverage counts: nobody counts on a day they're away (51e, 51g1).
 * With nobody away it is `shifts` itself, so nothing recounts.
 */
export function withoutAwayDays(
  shifts: ShiftMap,
  awayRanges: ReadonlyMap<string, AwayRange>,
): ShiftMap {
  if (awayRanges.size === 0) return shifts;
  const result: ShiftMap = {};
  for (const [key, entry] of Object.entries(shifts)) {
    const split = key.lastIndexOf("_");
    const range = awayRanges.get(key.slice(0, split));
    if (range && isInAwayRange(range, key.slice(split + 1))) continue;
    result[key] = entry;
  }
  return result;
}

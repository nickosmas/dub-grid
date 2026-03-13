import { Employee, ShiftCode } from "@/types";

export interface Tally {
  [label: string]: number;
}

/**
 * Per-date tallies keyed by shift category ID.
 * Each entry maps shift label → count of employees on that shift.
 */
export type DailyTallies = Record<number, Tally>;

/**
 * Computes per-category FTE counts for a single date across a set of employees.
 * Uses shift code IDs to determine section membership — only shift codes whose ID
 * is in `sectionCodeIds` are counted. This prevents cross-focus-area miscounting
 * when different sections share the same label (e.g. "D").
 * Only shift codes with a categoryId are counted (off-days and uncategorized codes are excluded).
 */
export function computeDailyTallies(
  employees: Employee[],
  date: Date,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  shiftCodeById: Map<number, ShiftCode>,
  sectionCodeIds: Set<number>,
): DailyTallies {
  const tallies: DailyTallies = {};

  for (const emp of employees) {
    const codeIds = shiftCodeIdsForKey(emp.id, date);
    if (codeIds.length === 0) continue;

    for (const codeId of codeIds) {
      if (!sectionCodeIds.has(codeId)) continue;
      const code = shiftCodeById.get(codeId);
      if (!code || code.categoryId == null) continue;
      tallies[code.categoryId] ??= {};
      tallies[code.categoryId][code.label] =
        (tallies[code.categoryId][code.label] || 0) + 1;
    }
  }

  return tallies;
}

/**
 * Filters employees by focus area ID and sorts by seniority (ascending).
 * Employees with empty focus area arrays are always excluded.
 * Pass null for activeFocusAreaId to show all focus areas.
 */
export function filterAndSortEmployees(
  employees: Employee[],
  activeFocusAreaId: number | null,
): Employee[] {
  return employees
    .filter(
      (e) =>
        e.focusAreaIds.length > 0 &&
        (activeFocusAreaId === null || e.focusAreaIds.includes(activeFocusAreaId)),
    )
    .sort((a, b) => a.seniority - b.seniority);
}

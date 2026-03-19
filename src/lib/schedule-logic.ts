import { Employee, ShiftCode } from "@/types";

/**
 * Checks whether an employee is qualified for a given shift code based on
 * focus area assignment and certification requirements.
 */
export function isEmployeeQualified(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  shiftCode: ShiftCode,
): boolean {
  const certOk = !shiftCode.requiredCertificationIds?.length ||
    (emp.certificationId != null && shiftCode.requiredCertificationIds.includes(emp.certificationId));
  const areaOk = !shiftCode.focusAreaId || emp.focusAreaIds.includes(shiftCode.focusAreaId);
  return certOk && areaOk;
}

/**
 * Returns human-readable reasons why an employee is not qualified for a shift code.
 */
export function getDisqualificationReasons(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  shiftCode: ShiftCode,
  focusAreaNames?: Map<number, string>,
  certificationNames?: Map<number, string>,
): string[] {
  const reasons: string[] = [];
  if (shiftCode.focusAreaId && !emp.focusAreaIds.includes(shiftCode.focusAreaId)) {
    const name = focusAreaNames?.get(shiftCode.focusAreaId) ?? `focus area #${shiftCode.focusAreaId}`;
    reasons.push(`not assigned to ${name}`);
  }
  if (shiftCode.requiredCertificationIds?.length) {
    if (emp.certificationId == null || !shiftCode.requiredCertificationIds.includes(emp.certificationId)) {
      const names = shiftCode.requiredCertificationIds
        .map(id => certificationNames?.get(id) ?? `cert #${id}`)
        .join(" or ");
      reasons.push(`requires ${names}`);
    }
  }
  return reasons;
}

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

import type {
  Employee,
  ShiftCode,
  FocusArea,
  ShiftCategory,
  CoverageRequirement,
  CoverageStatus,
  CoverageGap,
} from "@/types";

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

// ── Time Overlap Helpers ──────────────────────────────────────────────────────

export interface TimeRange {
  start: string;
  end: string;
}

/** Checks if two time ranges overlap. Handles overnight shifts where start > end. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.start > a.end) {
    return rangesOverlap({ start: a.start, end: "24:00" }, b)
        || rangesOverlap({ start: "00:00", end: a.end }, b);
  }
  if (b.start > b.end) {
    return rangesOverlap(a, { start: b.start, end: "24:00" })
        || rangesOverlap(a, { start: "00:00", end: b.end });
  }
  return a.start < b.end && b.start < a.end;
}

/** True if any range in `a` overlaps with any range in `b`. */
export function timesOverlap(a: TimeRange[], b: TimeRange[]): boolean {
  return a.some(r1 => b.some(r2 => rangesOverlap(r1, r2)));
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

// ── Coverage Intelligence ─────────────────────────────────────────────────────

/**
 * Resolves the coverage requirement for a given (focusAreaId, shiftCodeId, dayOfWeek).
 * Checks for a day-specific row first, then falls back to the "every day" row (dayOfWeek=null).
 */
export function resolveRequirement(
  requirements: CoverageRequirement[],
  focusAreaId: number,
  shiftCodeId: number,
  dayOfWeek: number,
): { minStaff: number } | null {
  const daySpecific = requirements.find(
    (r) =>
      r.focusAreaId === focusAreaId &&
      r.shiftCodeId === shiftCodeId &&
      r.dayOfWeek === dayOfWeek,
  );
  if (daySpecific) return { minStaff: daySpecific.minStaff };

  const everyDay = requirements.find(
    (r) =>
      r.focusAreaId === focusAreaId &&
      r.shiftCodeId === shiftCodeId &&
      r.dayOfWeek === null,
  );
  if (everyDay) return { minStaff: everyDay.minStaff };

  return null;
}

/**
 * Computes coverage status for a single (focusArea, shiftCode, date) cell.
 * Counts actual headcount and qualified headcount against the requirement.
 */
export function computeCoverageStatus(
  employees: Employee[],
  date: Date,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  sectionCodeIds: Set<number>,
  shiftCodeId: number,
  requirement: { minStaff: number },
): CoverageStatus {
  let actual = 0;

  for (const emp of employees) {
    const codeIds = shiftCodeIdsForKey(emp.id, date);
    if (codeIds.includes(shiftCodeId) && sectionCodeIds.has(shiftCodeId)) {
      actual++;
    }
  }

  const hasRequirement = requirement.minStaff > 0;
  const isMet = actual >= requirement.minStaff;

  return {
    actual,
    required: requirement.minStaff,
    isMet,
    hasRequirement,
  };
}

/**
 * Computes all coverage gaps across all focus areas, shift codes, and dates.
 * Returns only cells where requirements are not met.
 */
export function computeCoverageGaps(
  focusAreas: FocusArea[],
  shiftCategories: ShiftCategory[],
  shiftCodes: ShiftCode[],
  requirements: CoverageRequirement[],
  dates: Date[],
  employeesByFocusArea: Map<number, Employee[]>,
  shiftCodeIdsForKey: (empId: string, date: Date) => number[],
  shiftCodeById: Map<number, ShiftCode>,
  shiftCodeIdsByFocusArea: Map<number, Set<number>>,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const categoryById = new Map(shiftCategories.map((c) => [c.id, c]));
  const requiredCodeIds = new Set(requirements.map((r) => r.shiftCodeId));

  for (const fa of focusAreas) {
    const employees = employeesByFocusArea.get(fa.id) ?? [];
    const sectionCodeIds = shiftCodeIdsByFocusArea.get(fa.id) ?? new Set();

    for (const codeId of requiredCodeIds) {
      const code = shiftCodeById.get(codeId);
      if (!code || !sectionCodeIds.has(codeId)) continue;

      const cat = code.categoryId != null ? categoryById.get(code.categoryId) : undefined;

      for (const date of dates) {
        const dow = date.getDay();
        const req = resolveRequirement(requirements, fa.id, codeId, dow);
        if (!req) continue;

        const status = computeCoverageStatus(
          employees,
          date,
          shiftCodeIdsForKey,
          sectionCodeIds,
          codeId,
          req,
        );

        if (status.hasRequirement && !status.isMet) {
          gaps.push({
            focusAreaId: fa.id,
            focusAreaName: fa.name,
            shiftCodeId: codeId,
            shiftCodeLabel: code.label,
            shiftCategoryId: cat?.id ?? 0,
            shiftCategoryName: cat?.name ?? "Uncategorized",
            date,
            status,
          });
        }
      }
    }
  }

  return gaps;
}

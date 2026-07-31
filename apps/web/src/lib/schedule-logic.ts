import type { Employee, AssignmentDefinition, ShiftMap } from "@/types";
import type { CoverageRuleConfig } from "@dubgrid/domain";
import { formatDateKey, iterateDateRange } from "@/lib/utils";
// Coverage engine now lives in @dubgrid/schedule-core so both web and mobile
// call the exact same computation instead of maintaining two implementations
// that can silently drift (see packages/schedule-core/src/coverage.ts).
import { DEFAULT_COVERAGE_RULE_CONFIG, normalizeCoverageRuleConfig } from "@dubgrid/schedule-core";

export {
  DEFAULT_COVERAGE_RULE_CONFIG,
  normalizeCoverageRuleConfig,
  resolveRequirementByAssignment,
  resolveRequirementByJobShift,
  computeCoverageStatus,
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageCategorySnapshots,
  computeCoverageGaps,
  type CoverageCategorySnapshot,
} from "@dubgrid/schedule-core";

export type PublishedWindowState = "unpublished" | "partial" | "published";

export function createCoverageCreditResolver(
  shifts: ShiftMap,
  config?: Partial<CoverageRuleConfig> | null,
): (empId: string, date: Date, assignmentId: number) => number {
  const normalized = normalizeCoverageRuleConfig(config);
  const mentoredCredit = normalized.mentoredCoverageCreditPercent / 100;

  return (empId, date, assignmentId) => {
    const entry = shifts[`${empId}_${formatDateKey(date)}`];
    if (!entry || entry.isDelete) return 0;
    const segmentIndex = entry.assignmentIds.findIndex((id) => id === assignmentId);
    if (segmentIndex === -1) return 0;
    const segment = entry.segments?.[segmentIndex];
    return segment?.isMentored ? mentoredCredit : 1;
  };
}

/**
 * Checks whether an employee is qualified for a given shift code based on
 * focus area assignment and certification requirements.
 */
export function isEmployeeQualified(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  assignment: AssignmentDefinition,
): boolean {
  const certOk =
    !assignment.requiredCertificationIds?.length ||
    (emp.certificationId != null &&
      assignment.requiredCertificationIds.includes(emp.certificationId));
  const areaOk = !assignment.focusAreaId || emp.focusAreaIds.includes(assignment.focusAreaId);
  return certOk && areaOk;
}

/**
 * Returns human-readable reasons why an employee is not qualified for a shift code.
 */
export function getDisqualificationReasons(
  emp: { certificationId: number | null; focusAreaIds: number[] },
  assignment: AssignmentDefinition,
  focusAreaNames?: Map<number, string>,
  certificationNames?: Map<number, string>,
): string[] {
  const reasons: string[] = [];
  if (assignment.focusAreaId && !emp.focusAreaIds.includes(assignment.focusAreaId)) {
    const name =
      focusAreaNames?.get(assignment.focusAreaId) ?? `focus area #${assignment.focusAreaId}`;
    reasons.push(`not assigned to ${name}`);
  }
  if (assignment.requiredCertificationIds?.length) {
    if (
      emp.certificationId == null ||
      !assignment.requiredCertificationIds.includes(emp.certificationId)
    ) {
      const names = assignment.requiredCertificationIds
        .map((id) => certificationNames?.get(id) ?? `cert #${id}`)
        .join(" or ");
      reasons.push(`requires ${names}`);
    }
  }
  return reasons;
}

/**
 * Returns true when the scheduler grid should treat the cell as occupied.
 * Draft-deleted rows are intentionally treated as empty because they no longer
 * represent an active visible assignment in the draft schedule.
 */
export function hasVisibleGridShiftEntry(shift?: ShiftMap[string] | null): boolean {
  return !!(
    shift &&
    (shift.assignmentIds.length > 0 || shift.absenceTypeId != null) &&
    !shift.isDelete
  );
}

// ── Time Overlap Helpers ──────────────────────────────────────────────────────

export interface TimeRange {
  start: string;
  end: string;
}

/** Checks if two time ranges overlap. Handles overnight shifts where start > end. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  if (a.start > a.end) {
    return (
      rangesOverlap({ start: a.start, end: "24:00" }, b) ||
      rangesOverlap({ start: "00:00", end: a.end }, b)
    );
  }
  if (b.start > b.end) {
    return (
      rangesOverlap(a, { start: b.start, end: "24:00" }) ||
      rangesOverlap(a, { start: "00:00", end: b.end })
    );
  }
  return a.start < b.end && b.start < a.end;
}

/** True if any range in `a` overlaps with any range in `b`. */
export function timesOverlap(a: TimeRange[], b: TimeRange[]): boolean {
  return a.some((r1) => b.some((r2) => rangesOverlap(r1, r2)));
}

/**
 * Checks if a shift on a given date would overlap with adjacent-day shifts
 * due to overnight time crossing.
 *
 * An overnight shift on date D occupies [start, 24:00) on D and [00:00, end) on D+1.
 * This function checks:
 * - If the new shift is overnight, does its D+1 tail overlap with the next day's shift?
 * - If the previous day's shift is overnight, does its D tail overlap with the new shift?
 */
/** Treat "00:00" end time as "24:00" (end of day, not start of next day). */
function normalizeEnd(t: TimeRange): TimeRange {
  return t.end === "00:00" ? { start: t.start, end: "24:00" } : t;
}

export function checkCrossDateOverlap(
  rawNewShiftTimes: TimeRange,
  adjacentShifts: { prev?: TimeRange | null; next?: TimeRange | null },
): string[] {
  const warnings: string[] = [];
  const newShiftTimes = normalizeEnd(rawNewShiftTimes);
  const isNewOvernight = newShiftTimes.start > newShiftTimes.end;

  // New shift is overnight → its tail [00:00, end) bleeds into D+1
  if (isNewOvernight && adjacentShifts.next) {
    const tailOnNextDay: TimeRange = { start: "00:00", end: newShiftTimes.end };
    // Only compare against the D+1 portion of the next shift (not its D+2 tail)
    const next = normalizeEnd(adjacentShifts.next);
    const isNextOvernight = next.start > next.end;
    const nextOnSameDay: TimeRange = isNextOvernight ? { start: next.start, end: "24:00" } : next;
    if (rangesOverlap(tailOnNextDay, nextOnSameDay)) {
      warnings.push("This overnight shift overlaps with the next day\u2019s shift");
    }
  }

  // D-1 shift is overnight → its tail [00:00, prevEnd) bleeds into today
  const prev = adjacentShifts.prev ? normalizeEnd(adjacentShifts.prev) : null;
  if (prev && prev.start > prev.end) {
    const prevTailOnToday: TimeRange = { start: "00:00", end: prev.end };
    // Only compare against the D portion of the current shift (not its D+1 tail)
    const currentOnDay: TimeRange = isNewOvernight
      ? { start: newShiftTimes.start, end: "24:00" }
      : newShiftTimes;
    if (rangesOverlap(prevTailOnToday, currentOnDay)) {
      warnings.push("Overlaps with yesterday\u2019s overnight shift");
    }
  }

  return warnings;
}

/** Checks for time overlaps between multiple schedule options on the same day. */
export function checkSameDayOverlaps(ranges: TimeRange[], labels: string[]): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (rangesOverlap(normalizeEnd(ranges[i]), normalizeEnd(ranges[j]))) {
        warnings.push(`${labels[i]} and ${labels[j]} times overlap`);
      }
    }
  }
  return warnings;
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
 * Uses schedule option IDs to determine section membership — only assignments
 * whose ID is in `sectionCodeIds` are counted. This prevents cross-focus-area
 * miscounting when different sections share the same label (e.g. "D").
 * Only assignments with a categoryId are counted (off-days and uncategorized entries are excluded).
 */
export function computeDailyTallies(
  employees: Employee[],
  date: Date,
  assignmentIdsForKey: (empId: string, date: Date) => number[],
  assignmentById: Map<number, AssignmentDefinition>,
  sectionCodeIds: Set<number>,
  labelResolver?: (code: AssignmentDefinition) => string,
): DailyTallies {
  const tallies: DailyTallies = {};

  for (const emp of employees) {
    const codeIds = assignmentIdsForKey(emp.id, date);
    if (codeIds.length === 0) continue;

    for (const codeId of codeIds) {
      if (!sectionCodeIds.has(codeId)) continue;
      const code = assignmentById.get(codeId);
      if (!code || code.categoryId == null) continue;
      tallies[code.categoryId] ??= {};
      const label = labelResolver ? labelResolver(code) : code.label;
      tallies[code.categoryId][label] = (tallies[code.categoryId][label] || 0) + 1;
    }
  }

  return tallies;
}

/**
 * Filters employees by focus area ID and sorts by seniority (ascending) or name.
 * Employees with empty focus area arrays are always excluded.
 * Pass null for activeFocusAreaId to show all focus areas.
 */
export function filterAndSortEmployees(
  employees: Employee[],
  activeFocusAreaId: number | null,
  sortBy: "seniority" | "name" = "seniority",
): Employee[] {
  return employees
    .filter(
      (e) =>
        e.focusAreaIds.length > 0 &&
        (activeFocusAreaId === null || e.focusAreaIds.includes(activeFocusAreaId)),
    )
    .sort((a, b) =>
      sortBy === "name"
        ? a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)
        : a.seniority - b.seniority,
    );
}

/**
 * Expands publish-history date ranges into a Set of "YYYY-MM-DD" keys.
 * Used to check whether a given date has ever been published (O(1) lookup).
 */
export function buildPublishedDateSet(
  ranges: { startDate: string; endDate: string }[],
): Set<string> {
  const set = new Set<string>();
  for (const { startDate, endDate } of ranges) {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    for (const { dateKey } of iterateDateRange(start, end)) {
      set.add(dateKey);
    }
  }
  return set;
}

/**
 * Returns only the visible dates that have been published at least once.
 */
export function filterPublishedDates(dates: Date[], publishedDateSet: Set<string>): Date[] {
  return dates.filter((date) => publishedDateSet.has(formatDateKey(date)));
}

/**
 * Summarizes whether the visible window is unpublished, partially published,
 * or fully published. Empty windows default to "published" so non-grid views
 * (for example month view) do not show misleading unpublished messaging.
 */
export function getPublishedWindowState(
  dates: Date[],
  publishedDateSet: Set<string>,
): PublishedWindowState {
  if (dates.length === 0) return "published";
  const publishedDates = filterPublishedDates(dates, publishedDateSet);
  if (publishedDates.length === 0) return "unpublished";
  if (publishedDates.length < dates.length) return "partial";
  return "published";
}

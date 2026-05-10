import type {
  Employee,
  AssignmentDefinition,
  FocusArea,
  ShiftCategory,
  CoverageRequirement,
  CoverageStatus,
  CoverageGap,
  CoverageShortageDetail,
  ShiftMap,
} from "@/types";
import type { CoverageRuleConfig } from "@dubgrid/domain";
import { formatDateKey, iterateDateRange } from "@/lib/utils";

export type PublishedWindowState = "unpublished" | "partial" | "published";

export const DEFAULT_COVERAGE_RULE_CONFIG: CoverageRuleConfig = {
  mentoredCoverageCreditPercent: 100,
};

export function normalizeCoverageRuleConfig(
  config?: Partial<CoverageRuleConfig> | null,
): CoverageRuleConfig {
  const rawPercent = config?.mentoredCoverageCreditPercent;
  const mentoredCoverageCreditPercent =
    typeof rawPercent === "number" && Number.isFinite(rawPercent)
      ? Math.min(100, Math.max(0, Math.round(rawPercent)))
      : DEFAULT_COVERAGE_RULE_CONFIG.mentoredCoverageCreditPercent;

  return { mentoredCoverageCreditPercent };
}

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
  const certOk = !assignment.requiredCertificationIds?.length ||
    (emp.certificationId != null && assignment.requiredCertificationIds.includes(emp.certificationId));
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
    const name = focusAreaNames?.get(assignment.focusAreaId) ?? `focus area #${assignment.focusAreaId}`;
    reasons.push(`not assigned to ${name}`);
  }
  if (assignment.requiredCertificationIds?.length) {
    if (emp.certificationId == null || !assignment.requiredCertificationIds.includes(emp.certificationId)) {
      const names = assignment.requiredCertificationIds
        .map(id => certificationNames?.get(id) ?? `cert #${id}`)
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
export function hasVisibleGridShiftEntry(
  shift?: ShiftMap[string] | null,
): boolean {
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
    const nextOnSameDay: TimeRange = isNextOvernight
      ? { start: next.start, end: "24:00" }
      : next;
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
export function checkSameDayOverlaps(
  ranges: TimeRange[],
  labels: string[],
): string[] {
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
      tallies[code.categoryId][label] =
        (tallies[code.categoryId][label] || 0) + 1;
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
 * Resolves the coverage requirement for a given (focusAreaId, jobId, preferredShiftId, dayOfWeek).
 * Checks for a day-specific row first, then falls back to the "every day" row (dayOfWeek=null).
 */
export function resolveRequirement(
  requirements: CoverageRequirement[],
  focusAreaId: number,
  jobIdOrAssignmentDefinitionId: number,
  preferredShiftIdOrDayOfWeek: number | null,
  maybeDayOfWeek?: number,
): { minStaff: number } | null {
  const legacyMode = maybeDayOfWeek === undefined;
  const jobId = legacyMode ? null : jobIdOrAssignmentDefinitionId;
  const preferredShiftId = legacyMode ? null : (preferredShiftIdOrDayOfWeek ?? null);
  const dayOfWeek = legacyMode ? Number(preferredShiftIdOrDayOfWeek) : Number(maybeDayOfWeek);

  if (legacyMode) {
    const daySpecific = requirements.find(
      (requirement) =>
        requirement.focusAreaId === focusAreaId &&
        (requirement.assignmentId ?? null) === jobIdOrAssignmentDefinitionId &&
        requirement.dayOfWeek === dayOfWeek,
    );
    if (daySpecific) return { minStaff: daySpecific.minStaff };

    const everyDay = requirements.find(
      (requirement) =>
        requirement.focusAreaId === focusAreaId &&
        (requirement.assignmentId ?? null) === jobIdOrAssignmentDefinitionId &&
        requirement.dayOfWeek === null,
    );
    if (everyDay) return { minStaff: everyDay.minStaff };
    return null;
  }

  const daySpecific = requirements.find(
    (requirement) =>
      requirement.focusAreaId === focusAreaId &&
      requirement.jobId === jobId &&
      (requirement.preferredShiftId ?? null) === preferredShiftId &&
      requirement.dayOfWeek === dayOfWeek,
  );
  if (daySpecific) return { minStaff: daySpecific.minStaff };

  const everyDay = requirements.find(
    (requirement) =>
      requirement.focusAreaId === focusAreaId &&
      requirement.jobId === jobId &&
      (requirement.preferredShiftId ?? null) === preferredShiftId &&
      requirement.dayOfWeek === null,
  );
  if (everyDay) return { minStaff: everyDay.minStaff };

  return null;
}

function findCoverageAssignmentDefinition(
  assignments: AssignmentDefinition[],
  requirement: CoverageRequirement,
): AssignmentDefinition | null {
  if (requirement.assignmentId != null) {
    const legacyAssignmentDefinition = assignments.find(
      (assignment) => !assignment.archivedAt && assignment.id === requirement.assignmentId,
    );
    if (legacyAssignmentDefinition) return legacyAssignmentDefinition;
  }

  return assignments.find(
    (assignment) =>
      !assignment.archivedAt &&
      assignment.jobId === (requirement.jobId ?? null) &&
      (assignment.shiftId ?? assignment.categoryId ?? null) === (requirement.preferredShiftId ?? null) &&
      (assignment.focusAreaId === requirement.focusAreaId || assignment.focusAreaId == null),
  ) ?? null;
}

/**
 * Computes coverage status for a single (focusArea, assignment, date) cell.
 * Counts actual headcount and qualified headcount against the requirement.
 */
export function computeCoverageStatus(
  employees: Employee[],
  date: Date,
  assignmentIdsForKey: (empId: string, date: Date) => number[],
  sectionCodeIds: Set<number>,
  eligibleAssignmentDefinitionIds: number[] | Set<number>,
  requirement: { minStaff: number },
  coverageCreditForKey?: (empId: string, date: Date, assignmentId: number) => number,
): CoverageStatus {
  const eligibleAssignmentDefinitionIdSet =
    eligibleAssignmentDefinitionIds instanceof Set
      ? eligibleAssignmentDefinitionIds
      : new Set(eligibleAssignmentDefinitionIds);
  let actual = 0;

  for (const emp of employees) {
    const codeIds = assignmentIdsForKey(emp.id, date);
    let employeeCredit = 0;
    for (const codeId of codeIds) {
      if (!sectionCodeIds.has(codeId) || !eligibleAssignmentDefinitionIdSet.has(codeId)) {
        continue;
      }
      const credit = coverageCreditForKey?.(emp.id, date, codeId) ?? 1;
      employeeCredit = Math.max(employeeCredit, Math.min(1, Math.max(0, credit)));
    }
    if (employeeCredit > 0) {
      actual += employeeCredit;
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
 * Returns the schedule option IDs each focus area can use for coverage checks.
 * Focus areas can satisfy requirements with their own codes plus general codes.
 */
export function buildAssignmentDefinitionIdsByFocusArea(
  focusAreas: FocusArea[],
  assignments: AssignmentDefinition[],
): Map<number, Set<number>> {
  const assignmentIdsByFocusArea = new Map<number, Set<number>>();

  for (const fa of focusAreas) {
    assignmentIdsByFocusArea.set(
      fa.id,
      new Set(
        assignments
          .filter((sc) => sc.focusAreaId === fa.id || sc.focusAreaId == null)
          .map((sc) => sc.id),
      ),
    );
  }

  return assignmentIdsByFocusArea;
}

export interface CoverageCategorySnapshot {
  focusAreaId: number;
  focusAreaName: string;
  shiftCategoryId: number;
  shiftCategoryName: string;
  date: Date;
  status: CoverageStatus;
  eligibleAssignmentDefinitionIds: number[];
  preferredOpenAssignmentDefinitionId: number;
  shortageDetails: CoverageShortageDetail[];
}

function getAssignmentDisplayLabel(
  assignment: AssignmentDefinition,
  assignmentLabelMap?: Map<number, string>,
): string {
  return assignmentLabelMap?.get(assignment.id) || assignment.label;
}

function compareAssignmentDefinitions(left: AssignmentDefinition, right: AssignmentDefinition): number {
  return left.sortOrder - right.sortOrder || left.id - right.id;
}

function getRequirementGroupKey(
  focusAreaId: number,
  jobId: number,
  preferredShiftId: number | null,
): string {
  return `${focusAreaId}:${jobId}:${preferredShiftId ?? "null"}`;
}

/**
 * Computes coverage snapshots for each focus area/date/assignable option.
 */
export function computeCoverageCategorySnapshots(
  focusAreas: FocusArea[],
  shiftCategories: ShiftCategory[],
  assignments: AssignmentDefinition[],
  requirements: CoverageRequirement[],
  dates: Date[],
  employeesByFocusArea: Map<number, Employee[]>,
  assignmentIdsForKey: (empId: string, date: Date) => number[],
  assignmentIdsByFocusArea: Map<number, Set<number>>,
  assignmentLabelMap?: Map<number, string>,
  coverageCreditForKey?: (empId: string, date: Date, assignmentId: number) => number,
): CoverageCategorySnapshot[] {
  const snapshots: CoverageCategorySnapshot[] = [];
  const categoryById = new Map(shiftCategories.map((category) => [category.id, category]));
  const activeAssignmentDefinitions = assignments.filter((assignment) => !assignment.archivedAt);
  const legacyRequirements = requirements.filter((requirement) => requirement.assignmentId != null);
  const newRequirements = requirements.filter((requirement) => requirement.assignmentId == null);
  const activeAssignmentDefinitionById = new Map(activeAssignmentDefinitions.map((assignment) => [assignment.id, assignment]));
  const requirementAssignmentDefinitionIdsByGroup = new Map<string, number[]>();

  for (const requirement of legacyRequirements) {
    const assignment = activeAssignmentDefinitionById.get(requirement.assignmentId ?? -1);
    if (!assignment) continue;
    const groupKey = `${requirement.focusAreaId}:${assignment.categoryId ?? 0}`;
    const group = requirementAssignmentDefinitionIdsByGroup.get(groupKey) ?? [];
    if (!group.includes(assignment.id)) {
      group.push(assignment.id);
      requirementAssignmentDefinitionIdsByGroup.set(groupKey, group);
    }
  }

  for (const focusArea of focusAreas) {
    const employees = employeesByFocusArea.get(focusArea.id) ?? [];
    const sectionCodeIds = assignmentIdsByFocusArea.get(focusArea.id) ?? new Set();

    for (const [groupKey, requirementAssignmentDefinitionIds] of requirementAssignmentDefinitionIdsByGroup.entries()) {
      const [groupFocusAreaIdRaw, shiftCategoryIdRaw] = groupKey.split(":");
      if (Number(groupFocusAreaIdRaw) !== focusArea.id) continue;

      const shiftCategoryId = Number(shiftCategoryIdRaw);
      const eligibleAssignmentDefinitions = activeAssignmentDefinitions
        .filter(
          (assignment) =>
            sectionCodeIds.has(assignment.id) &&
            (assignment.categoryId ?? 0) === shiftCategoryId,
        )
        .sort(compareAssignmentDefinitions);
      if (eligibleAssignmentDefinitions.length === 0) continue;

      const sortedRequirementAssignmentIds = [...requirementAssignmentDefinitionIds].sort((leftId, rightId) => {
        const left = activeAssignmentDefinitionById.get(leftId);
        const right = activeAssignmentDefinitionById.get(rightId);
        if (!left || !right) return leftId - rightId;
        return compareAssignmentDefinitions(left, right);
      });

      for (const date of dates) {
        const dayOfWeek = date.getDay();
        let totalRequired = 0;
        const shortageDetails: CoverageShortageDetail[] = [];

        for (const assignmentId of sortedRequirementAssignmentIds) {
          const assignment = activeAssignmentDefinitionById.get(assignmentId);
          if (!assignment) continue;

          const requirement = resolveRequirement(
            legacyRequirements,
            focusArea.id,
            assignmentId,
            dayOfWeek,
          );
          if (!requirement || requirement.minStaff <= 0) continue;

          totalRequired += requirement.minStaff;

          const exactStatus = computeCoverageStatus(
            employees,
            date,
            assignmentIdsForKey,
            sectionCodeIds,
            [assignmentId],
            requirement,
            coverageCreditForKey,
          );
          const shortage = Math.max(requirement.minStaff - exactStatus.actual, 0);
          if (shortage > 0) {
            shortageDetails.push({
              assignmentId: assignmentId,
              assignmentLabel: getAssignmentDisplayLabel(assignment, assignmentLabelMap),
              required: requirement.minStaff,
              actual: exactStatus.actual,
              shortage,
            });
          }
        }

        if (totalRequired <= 0) continue;

        const status = computeCoverageStatus(
          employees,
          date,
          assignmentIdsForKey,
          sectionCodeIds,
          eligibleAssignmentDefinitions.map((assignment) => assignment.id),
          { minStaff: totalRequired },
          coverageCreditForKey,
        );
        const preferredOpenAssignmentDefinitionId =
          shortageDetails[0]?.assignmentId ??
          sortedRequirementAssignmentIds[0] ??
          eligibleAssignmentDefinitions[0].id;

        snapshots.push({
          focusAreaId: focusArea.id,
          focusAreaName: focusArea.name,
          shiftCategoryId,
          shiftCategoryName: categoryById.get(shiftCategoryId)?.name ?? "Uncategorized",
          date,
          status,
          eligibleAssignmentDefinitionIds: eligibleAssignmentDefinitions.map((assignment) => assignment.id),
          preferredOpenAssignmentDefinitionId,
          shortageDetails,
        });
      }
    }

    const localRequirementGroups = Array.from(
      new Map(
        newRequirements
          .filter((requirement) => requirement.focusAreaId === focusArea.id)
          .map((requirement) => {
            const assignment = findCoverageAssignmentDefinition(
              activeAssignmentDefinitions,
              requirement,
            );
            if (!assignment) return null;
            const jobId = requirement.jobId ?? 0;
            const preferredShiftId = requirement.preferredShiftId ?? null;
            return [
              getRequirementGroupKey(
                focusArea.id,
                jobId,
                preferredShiftId,
              ),
              {
                assignment,
                jobId,
                preferredShiftId,
              },
            ] as const;
          })
          .filter(
            (
              entry,
            ): entry is readonly [
              string,
              {
                assignment: AssignmentDefinition;
                jobId: number;
                preferredShiftId: number | null;
              },
            ] => entry != null,
          ),
      ).values(),
    ).sort((left, right) =>
      compareAssignmentDefinitions(left.assignment, right.assignment),
    );

    for (const { assignment, jobId, preferredShiftId } of localRequirementGroups) {
      for (const date of dates) {
        const resolvedRequirement = resolveRequirement(
          requirements,
          focusArea.id,
          jobId,
          preferredShiftId,
          date.getDay(),
        );
        if (!resolvedRequirement || resolvedRequirement.minStaff <= 0) continue;

        const status = computeCoverageStatus(
          employees,
          date,
          assignmentIdsForKey,
          sectionCodeIds,
          [assignment.id],
          resolvedRequirement,
          coverageCreditForKey,
        );
        const shortage = Math.max(resolvedRequirement.minStaff - status.actual, 0);
        const displayLabel = getAssignmentDisplayLabel(assignment, assignmentLabelMap);

        snapshots.push({
          focusAreaId: focusArea.id,
          focusAreaName: focusArea.name,
          shiftCategoryId: assignment.categoryId ?? assignment.shiftId ?? 0,
          shiftCategoryName:
            categoryById.get(assignment.categoryId ?? assignment.shiftId ?? -1)?.name ??
            displayLabel,
          date,
          status,
          eligibleAssignmentDefinitionIds: [assignment.id],
          preferredOpenAssignmentDefinitionId: assignment.id,
          shortageDetails: shortage > 0 ? [{
            assignmentId: assignment.id,
            assignmentLabel: displayLabel,
            required: resolvedRequirement.minStaff,
            actual: status.actual,
            shortage,
          }] : [],
        });
      }
    }
  }

  return snapshots;
}

/**
 * Computes all category-level coverage gaps across all focus areas and dates.
 */
export function computeCoverageGaps(
  focusAreas: FocusArea[],
  shiftCategories: ShiftCategory[],
  assignments: AssignmentDefinition[],
  requirements: CoverageRequirement[],
  dates: Date[],
  employeesByFocusArea: Map<number, Employee[]>,
  assignmentIdsForKey: (empId: string, date: Date) => number[],
  assignmentById: Map<number, AssignmentDefinition>,
  assignmentIdsByFocusArea: Map<number, Set<number>>,
  assignmentLabelMap?: Map<number, string>,
  coverageCreditForKey?: (empId: string, date: Date, assignmentId: number) => number,
): CoverageGap[] {
  void assignmentById;

  return computeCoverageCategorySnapshots(
    focusAreas,
    shiftCategories,
    assignments,
    requirements,
    dates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentIdsByFocusArea,
    assignmentLabelMap,
    coverageCreditForKey,
  )
    .filter((snapshot) => snapshot.status.hasRequirement && !snapshot.status.isMet)
    .map((snapshot) => ({
      focusAreaId: snapshot.focusAreaId,
      focusAreaName: snapshot.focusAreaName,
      requirementAssignmentDefinitionId: snapshot.preferredOpenAssignmentDefinitionId,
      assignmentId: snapshot.preferredOpenAssignmentDefinitionId,
      ruleLabel: snapshot.shortageDetails[0]?.assignmentLabel ?? snapshot.shiftCategoryName,
      assignmentLabel: snapshot.shortageDetails[0]?.assignmentLabel ?? snapshot.shiftCategoryName,
      eligibleAssignmentDefinitionIds: snapshot.eligibleAssignmentDefinitionIds,
      preferredOpenAssignmentDefinitionId: snapshot.preferredOpenAssignmentDefinitionId,
      shiftCategoryId: snapshot.shiftCategoryId,
      shiftCategoryName: snapshot.shiftCategoryName,
      date: snapshot.date,
      status: snapshot.status,
      shortageDetails: snapshot.shortageDetails,
    }));
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
export function filterPublishedDates(
  dates: Date[],
  publishedDateSet: Set<string>,
): Date[] {
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

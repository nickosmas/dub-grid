import type { CoverageRuleConfig } from "@dubgrid/domain";

// ── Structural input types ──────────────────────────────────────────────────
// Minimal shapes containing only the fields this module touches. Web's richer
// local Employee/AssignmentDefinition/FocusArea/ShiftCategory/CoverageRequirement
// types (and mobile's row-mapped equivalents) already satisfy these structurally
// — no explicit import/coupling needed.

export type CoverageEmployeeLike = { id: string };

export type CoverageFocusAreaLike = { id: number; name: string };

export type CoverageShiftCategoryLike = { id: number; name: string };

export type CoverageAssignmentDefinitionLike = {
  id: number;
  label: string;
  archivedAt?: string | null;
  categoryId?: number | null;
  shiftId?: number | null;
  jobId?: number | null;
  focusAreaId?: number | null;
  sortOrder: number;
};

export type CoverageRequirementLike = {
  focusAreaId: number;
  jobId?: number | null;
  preferredShiftId?: number | null;
  assignmentId?: number | null;
  dayOfWeek: number | null;
  minStaff: number;
};

// ── Coverage result types ───────────────────────────────────────────────────

export interface CoverageStatus {
  /** Actual headcount assigned on this date in this section. */
  actual: number;
  /** Required headcount from coverage_requirements. */
  required: number;
  /** True when actual >= required. */
  isMet: boolean;
  /** True when there is a requirement defined (required > 0). */
  hasRequirement: boolean;
}

export interface CoverageShortageDetail {
  assignmentId: number;
  assignmentLabel: string;
  required: number;
  actual: number;
  shortage: number;
}

/**
 * A coverage gap: a (focus_area, shift_category, date) tuple where category
 * staffing totals are not met. Exact-code shortages are carried as detail.
 */
export interface CoverageGap {
  focusAreaId: number;
  focusAreaName: string;
  requirementAssignmentDefinitionId: number;
  assignmentId: number;
  ruleLabel: string;
  assignmentLabel: string;
  eligibleAssignmentDefinitionIds: number[];
  preferredOpenAssignmentDefinitionId: number;
  shiftCategoryId: number;
  shiftCategoryName: string;
  date: Date;
  status: CoverageStatus;
  shortageDetails: CoverageShortageDetail[];
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

// ── Coverage rule config ────────────────────────────────────────────────────

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

// ── Coverage intelligence ───────────────────────────────────────────────────

/**
 * Resolves the coverage requirement for a given (focusAreaId, jobId, preferredShiftId, dayOfWeek).
 * Checks for a day-specific row first, then falls back to the "every day" row (dayOfWeek=null).
 */
export function resolveRequirement(
  requirements: CoverageRequirementLike[],
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
  assignments: CoverageAssignmentDefinitionLike[],
  requirement: CoverageRequirementLike,
): CoverageAssignmentDefinitionLike | null {
  if (requirement.assignmentId != null) {
    const legacyAssignmentDefinition = assignments.find(
      (assignment) => !assignment.archivedAt && assignment.id === requirement.assignmentId,
    );
    if (legacyAssignmentDefinition) return legacyAssignmentDefinition;
  }

  return (
    assignments.find(
      (assignment) =>
        !assignment.archivedAt &&
        assignment.jobId === (requirement.jobId ?? null) &&
        (assignment.shiftId ?? assignment.categoryId ?? null) ===
          (requirement.preferredShiftId ?? null) &&
        (assignment.focusAreaId === requirement.focusAreaId || assignment.focusAreaId == null),
    ) ?? null
  );
}

/**
 * Computes coverage status for a single (focusArea, assignment, date) cell.
 * Counts actual headcount and qualified headcount against the requirement.
 */
export function computeCoverageStatus(
  employees: CoverageEmployeeLike[],
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
  focusAreas: CoverageFocusAreaLike[],
  assignments: CoverageAssignmentDefinitionLike[],
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

function getAssignmentDisplayLabel(
  assignment: CoverageAssignmentDefinitionLike,
  assignmentLabelMap?: Map<number, string>,
): string {
  return assignmentLabelMap?.get(assignment.id) || assignment.label;
}

function compareAssignmentDefinitions(
  left: CoverageAssignmentDefinitionLike,
  right: CoverageAssignmentDefinitionLike,
): number {
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
  focusAreas: CoverageFocusAreaLike[],
  shiftCategories: CoverageShiftCategoryLike[],
  assignments: CoverageAssignmentDefinitionLike[],
  requirements: CoverageRequirementLike[],
  dates: Date[],
  employeesByFocusArea: Map<number, CoverageEmployeeLike[]>,
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
  const activeAssignmentDefinitionById = new Map(
    activeAssignmentDefinitions.map((assignment) => [assignment.id, assignment]),
  );
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

    for (const [
      groupKey,
      requirementAssignmentDefinitionIds,
    ] of requirementAssignmentDefinitionIdsByGroup.entries()) {
      const [groupFocusAreaIdRaw, shiftCategoryIdRaw] = groupKey.split(":");
      if (Number(groupFocusAreaIdRaw) !== focusArea.id) continue;

      const shiftCategoryId = Number(shiftCategoryIdRaw);
      const eligibleAssignmentDefinitions = activeAssignmentDefinitions
        .filter(
          (assignment) =>
            sectionCodeIds.has(assignment.id) && (assignment.categoryId ?? 0) === shiftCategoryId,
        )
        .sort(compareAssignmentDefinitions);
      if (eligibleAssignmentDefinitions.length === 0) continue;

      const sortedRequirementAssignmentIds = [...requirementAssignmentDefinitionIds].sort(
        (leftId, rightId) => {
          const left = activeAssignmentDefinitionById.get(leftId);
          const right = activeAssignmentDefinitionById.get(rightId);
          if (!left || !right) return leftId - rightId;
          return compareAssignmentDefinitions(left, right);
        },
      );

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
          eligibleAssignmentDefinitionIds: eligibleAssignmentDefinitions.map(
            (assignment) => assignment.id,
          ),
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
              getRequirementGroupKey(focusArea.id, jobId, preferredShiftId),
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
                assignment: CoverageAssignmentDefinitionLike;
                jobId: number;
                preferredShiftId: number | null;
              },
            ] => entry != null,
          ),
      ).values(),
    ).sort((left, right) => compareAssignmentDefinitions(left.assignment, right.assignment));

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
          shortageDetails:
            shortage > 0
              ? [
                  {
                    assignmentId: assignment.id,
                    assignmentLabel: displayLabel,
                    required: resolvedRequirement.minStaff,
                    actual: status.actual,
                    shortage,
                  },
                ]
              : [],
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
  focusAreas: CoverageFocusAreaLike[],
  shiftCategories: CoverageShiftCategoryLike[],
  assignments: CoverageAssignmentDefinitionLike[],
  requirements: CoverageRequirementLike[],
  dates: Date[],
  employeesByFocusArea: Map<number, CoverageEmployeeLike[]>,
  assignmentIdsForKey: (empId: string, date: Date) => number[],
  assignmentById: Map<number, CoverageAssignmentDefinitionLike>,
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

// ── Aggregation helpers ─────────────────────────────────────────────────────
// The single source of truth for "coverage %" / "filled vs required" math.
// Both web's dashboard-stats.ts and mobile's dashboard payload builder call
// these against the same CoverageCategorySnapshot[] so the numbers are
// identical by construction rather than by convention.

export interface CoverageTotals {
  totalRequired: number;
  totalFilled: number;
  pct: number;
  openSlots: number;
}

export function summarizeCoverageTotals(
  snapshots: ReadonlyArray<CoverageCategorySnapshot>,
): CoverageTotals {
  let totalRequired = 0;
  let totalFilled = 0;

  for (const snapshot of snapshots) {
    totalRequired += snapshot.status.required;
    totalFilled += Math.min(snapshot.status.actual, snapshot.status.required);
  }

  const pct = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;

  return {
    totalRequired,
    totalFilled,
    pct,
    openSlots: Math.max(totalRequired - totalFilled, 0),
  };
}

export interface CoverageByFocusAreaEntry {
  focusAreaId: number;
  focusAreaName: string;
  filledTotal: number;
  requiredTotal: number;
  pct: number;
}

export function summarizeCoverageByFocusArea(
  snapshots: ReadonlyArray<CoverageCategorySnapshot>,
  focusAreas: ReadonlyArray<CoverageFocusAreaLike>,
): CoverageByFocusAreaEntry[] {
  const totalsByFocusArea = new Map<number, { filledTotal: number; requiredTotal: number }>();

  for (const snapshot of snapshots) {
    const totals = totalsByFocusArea.get(snapshot.focusAreaId) ?? {
      filledTotal: 0,
      requiredTotal: 0,
    };
    totals.requiredTotal += snapshot.status.required;
    totals.filledTotal += Math.min(snapshot.status.actual, snapshot.status.required);
    totalsByFocusArea.set(snapshot.focusAreaId, totals);
  }

  const focusAreaNameById = new Map(focusAreas.map((fa) => [fa.id, fa.name]));

  return Array.from(totalsByFocusArea.entries())
    .map(([focusAreaId, totals]) => ({
      focusAreaId,
      focusAreaName: focusAreaNameById.get(focusAreaId) ?? "Unknown",
      filledTotal: totals.filledTotal,
      requiredTotal: totals.requiredTotal,
      pct:
        totals.requiredTotal > 0
          ? Math.round((totals.filledTotal / totals.requiredTotal) * 100)
          : 100,
    }))
    .filter((entry) => entry.requiredTotal > 0);
}

export type OpenShiftUrgency = "high" | "medium" | "low";

/** High: today/tomorrow. Medium: within 3 days. Low: further out or already past. */
export function classifyOpenShiftUrgency(shiftDate: Date, today: Date): OpenShiftUrgency {
  const daysUntil = Math.floor((shiftDate.getTime() - today.getTime()) / 86_400_000);
  if (daysUntil < 0) return "low";
  if (daysUntil <= 1) return "high";
  if (daysUntil <= 3) return "medium";
  return "low";
}

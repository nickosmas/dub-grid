import type { CoverageRuleConfig } from "@dubgrid/domain";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageCategorySnapshots,
  normalizeCoverageRuleConfig,
  snapshotsToGaps,
  summarizeCoverageByFocusArea,
  summarizeCoverageTotals,
  type CoverageAssignmentDefinitionLike,
  type CoverageByFocusAreaEntry,
  type CoverageCategorySnapshot,
  type CoverageEmployeeLike,
  type CoverageFocusAreaLike,
  type CoverageGap,
  type CoverageRequirementLike,
  type CoverageShiftCategoryLike,
  type CoverageTotals,
} from "./coverage";

// ── Platform adapter boundary ───────────────────────────────────────────────
// The one thing that legitimately differs by platform: how to read an
// employee's resolved shift segments for a date out of that platform's own
// row shape (web's ShiftMap entries, mobile's MobilePublishedScheduleRow).
// Everything downstream of this function is identical for both platforms.

export interface ResolvedShiftSegment {
  assignmentId: number;
  isMentored: boolean;
}

export type SegmentsForEmployeeDate = (empId: string, date: Date) => ResolvedShiftSegment[];

/**
 * Canonical mentored-coverage credit resolver. Takes the max credit across all
 * of an employee's segments matching `assignmentId` on that date (order
 * independent), consistent with `computeCoverageStatus`'s own
 * `Math.max(employeeCredit, ...)` across an employee's matching assignment IDs.
 */
export function buildCoverageCreditResolver(
  segmentsForKey: SegmentsForEmployeeDate,
  config?: Partial<CoverageRuleConfig> | null,
): (empId: string, date: Date, assignmentId: number) => number {
  const normalized = normalizeCoverageRuleConfig(config);
  const mentoredCredit = normalized.mentoredCoverageCreditPercent / 100;

  return (empId, date, assignmentId) => {
    let credit = 0;
    for (const segment of segmentsForKey(empId, date)) {
      if (segment.assignmentId !== assignmentId) continue;
      credit = Math.max(credit, segment.isMentored ? mentoredCredit : 1);
    }
    return credit;
  };
}

export function buildAssignmentIdsForKeyResolver(
  segmentsForKey: SegmentsForEmployeeDate,
): (empId: string, date: Date) => number[] {
  return (empId, date) => segmentsForKey(empId, date).map((segment) => segment.assignmentId);
}

export function groupEmployeesByFocusArea<
  E extends CoverageEmployeeLike & { focusAreaIds: number[] },
>(focusAreas: ReadonlyArray<CoverageFocusAreaLike>, employees: ReadonlyArray<E>): Map<number, E[]> {
  const employeesByFocusArea = new Map<number, E[]>();
  for (const focusArea of focusAreas) {
    employeesByFocusArea.set(
      focusArea.id,
      employees.filter((employee) => employee.focusAreaIds.includes(focusArea.id)),
    );
  }
  return employeesByFocusArea;
}

// ── The canonical assembly ──────────────────────────────────────────────────
// The single entry point both web and mobile call to go from raw fetched rows
// to a complete dashboard coverage payload — replacing each platform's own
// hand-written input-assembly layer around the shared math in coverage.ts.

export interface DashboardCoverageAssemblyInput {
  focusAreas: CoverageFocusAreaLike[];
  shiftCategories: CoverageShiftCategoryLike[];
  assignments: CoverageAssignmentDefinitionLike[];
  requirements: CoverageRequirementLike[];
  employees: (CoverageEmployeeLike & { focusAreaIds: number[] })[];
  dates: Date[];
  segmentsForKey: SegmentsForEmployeeDate;
  coverageRuleConfig?: Partial<CoverageRuleConfig> | null;
  assignmentLabelMap?: Map<number, string>;
  assignmentNameMap?: Map<number, string>;
}

export interface DashboardCoverageAssembly {
  snapshots: CoverageCategorySnapshot[];
  gaps: CoverageGap[];
  totals: CoverageTotals;
  byFocusArea: CoverageByFocusAreaEntry[];
}

export function assembleDashboardCoverage(
  input: DashboardCoverageAssemblyInput,
): DashboardCoverageAssembly {
  const employeesByFocusArea = groupEmployeesByFocusArea(input.focusAreas, input.employees);
  const assignmentIdsByFocusArea = buildAssignmentDefinitionIdsByFocusArea(
    input.focusAreas,
    input.assignments,
  );
  const coverageCreditForKey = buildCoverageCreditResolver(
    input.segmentsForKey,
    input.coverageRuleConfig,
  );
  const assignmentIdsForKey = buildAssignmentIdsForKeyResolver(input.segmentsForKey);

  const snapshots = computeCoverageCategorySnapshots({
    focusAreas: input.focusAreas,
    shiftCategories: input.shiftCategories,
    assignments: input.assignments,
    requirements: input.requirements,
    dates: input.dates,
    employeesByFocusArea,
    assignmentIdsForKey,
    assignmentIdsByFocusArea,
    assignmentLabelMap: input.assignmentLabelMap,
    assignmentNameMap: input.assignmentNameMap,
    coverageCreditForKey,
  });

  return {
    snapshots,
    gaps: snapshotsToGaps(snapshots),
    totals: summarizeCoverageTotals(snapshots),
    byFocusArea: summarizeCoverageByFocusArea(snapshots, input.focusAreas),
  };
}

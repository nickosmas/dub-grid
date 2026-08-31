import { describe, expect, it } from "vitest";
import {
  assembleDashboardCoverage,
  buildCoverageCreditResolver,
  groupEmployeesByFocusArea,
  type ResolvedShiftSegment,
} from "./coverage-assembly";
import type {
  CoverageAssignmentDefinitionLike,
  CoverageEmployeeLike,
  CoverageFocusAreaLike,
  CoverageRequirementLike,
  CoverageShiftCategoryLike,
} from "./coverage";

function makeEmployee(
  overrides: Partial<CoverageEmployeeLike & { focusAreaIds: number[] }> = {},
): CoverageEmployeeLike & { focusAreaIds: number[] } {
  return { id: "emp-1", focusAreaIds: [1], ...overrides };
}

function makeAssignment(
  overrides: Partial<CoverageAssignmentDefinitionLike> = {},
): CoverageAssignmentDefinitionLike {
  return { id: 1, label: "D", sortOrder: 1, categoryId: null, ...overrides };
}

function makeFocusArea(overrides: Partial<CoverageFocusAreaLike> = {}): CoverageFocusAreaLike {
  return { id: 1, name: "ICU", ...overrides };
}

function makeShiftCategory(
  overrides: Partial<CoverageShiftCategoryLike> = {},
): CoverageShiftCategoryLike {
  return { id: 1, name: "Day", ...overrides };
}

function makeCoverageRequirement(
  overrides: Partial<CoverageRequirementLike> = {},
): CoverageRequirementLike {
  return {
    focusAreaId: 1,
    jobId: 1,
    preferredShiftId: 1,
    assignmentId: 1,
    dayOfWeek: null,
    minStaff: 2,
    ...overrides,
  };
}

describe("buildCoverageCreditResolver", () => {
  const date = new Date(2024, 0, 15);

  it("takes the max credit across segments matching the assignment, regardless of order", () => {
    const mentoredFirst: ResolvedShiftSegment[] = [
      { assignmentId: 10, isMentored: true },
      { assignmentId: 10, isMentored: false },
    ];
    const mentoredLast: ResolvedShiftSegment[] = [
      { assignmentId: 10, isMentored: false },
      { assignmentId: 10, isMentored: true },
    ];

    const resolverA = buildCoverageCreditResolver(() => mentoredFirst, {
      mentoredCoverageCreditPercent: 50,
    });
    const resolverB = buildCoverageCreditResolver(() => mentoredLast, {
      mentoredCoverageCreditPercent: 50,
    });

    // A non-mentored segment among duplicates always wins the max, so both
    // orderings must produce full credit (1), not the mentored 0.5.
    expect(resolverA("emp-1", date, 10)).toBe(1);
    expect(resolverB("emp-1", date, 10)).toBe(1);
  });

  it("applies the mentored discount when every matching segment is mentored", () => {
    const segments: ResolvedShiftSegment[] = [{ assignmentId: 10, isMentored: true }];
    const resolver = buildCoverageCreditResolver(() => segments, {
      mentoredCoverageCreditPercent: 50,
    });
    expect(resolver("emp-1", date, 10)).toBe(0.5);
  });

  it("returns 0 for an assignment the employee has no segment for", () => {
    const segments: ResolvedShiftSegment[] = [{ assignmentId: 99, isMentored: false }];
    const resolver = buildCoverageCreditResolver(() => segments);
    expect(resolver("emp-1", date, 10)).toBe(0);
  });
});

describe("groupEmployeesByFocusArea", () => {
  it("groups employees under every focus area they belong to", () => {
    const focusAreas = [makeFocusArea({ id: 1 }), makeFocusArea({ id: 2, name: "ER" })];
    const employees = [
      makeEmployee({ id: "emp-1", focusAreaIds: [1] }),
      makeEmployee({ id: "emp-2", focusAreaIds: [1, 2] }),
    ];
    const grouped = groupEmployeesByFocusArea(focusAreas, employees);
    expect(grouped.get(1)?.map((e) => e.id)).toEqual(["emp-1", "emp-2"]);
    expect(grouped.get(2)?.map((e) => e.id)).toEqual(["emp-2"]);
  });
});

describe("assembleDashboardCoverage", () => {
  const date = new Date(2024, 0, 15); // Monday

  it("produces totals, byFocusArea, and gaps consistent with one shared snapshot pass", () => {
    const focusAreas = [makeFocusArea({ id: 1, name: "ICU" })];
    const shiftCategories = [makeShiftCategory({ id: 1, name: "Day" })];
    const assignments = [makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 })];
    const requirements = [
      makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, minStaff: 2 }),
    ];
    const employees = [
      makeEmployee({ id: "emp-1", focusAreaIds: [1] }),
      makeEmployee({ id: "emp-2", focusAreaIds: [1] }),
    ];
    // Only emp-1 is actually scheduled onto assignment 10 -> understaffed by 1.
    const segments = new Map<string, ResolvedShiftSegment[]>([
      ["emp-1", [{ assignmentId: 10, isMentored: false }]],
    ]);

    const result = assembleDashboardCoverage({
      focusAreas,
      shiftCategories,
      assignments,
      requirements,
      employees,
      dates: [date],
      segmentsForKey: (empId) => segments.get(empId) ?? [],
    });

    expect(result.totals).toEqual({
      totalRequired: 2,
      totalFilled: 1,
      pct: 50,
      openSlots: 1,
    });
    expect(result.byFocusArea).toEqual([
      { focusAreaId: 1, focusAreaName: "ICU", filledTotal: 1, requiredTotal: 2, pct: 50 },
    ]);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].status).toEqual({
      actual: 1,
      required: 2,
      isMet: false,
      hasRequirement: true,
    });
    // gaps must be derivable from the same snapshots already computed, not a
    // second independent pass.
    expect(result.gaps[0].focusAreaId).toBe(result.snapshots[0].focusAreaId);
  });

  it("reports no gaps once staffing meets the requirement", () => {
    const focusAreas = [makeFocusArea({ id: 1, name: "ICU" })];
    const assignments = [makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 })];
    const requirements = [
      makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, minStaff: 1 }),
    ];
    const employees = [makeEmployee({ id: "emp-1", focusAreaIds: [1] })];
    const segments = new Map<string, ResolvedShiftSegment[]>([
      ["emp-1", [{ assignmentId: 10, isMentored: false }]],
    ]);

    const result = assembleDashboardCoverage({
      focusAreas,
      shiftCategories: [],
      assignments,
      requirements,
      employees,
      dates: [date],
      segmentsForKey: (empId) => segments.get(empId) ?? [],
    });

    expect(result.gaps).toHaveLength(0);
    expect(result.totals.pct).toBe(100);
  });
});

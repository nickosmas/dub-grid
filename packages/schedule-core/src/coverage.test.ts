import { describe, expect, it } from "vitest";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  classifyOpenShiftUrgency,
  computeCoverageCategorySnapshots,
  computeCoverageGaps,
  computeCoverageStatus,
  hasEffectiveCoverageRequirements,
  normalizeCoverageRuleConfig,
  resolveDayOffAbsenceType,
  resolveRequirementByAssignment,
  summarizeCoverageByFocusArea,
  summarizeCoverageDailyForFocusArea,
  summarizeCoverageTotals,
  type CoverageAssignmentDefinitionLike,
  type CoverageEmployeeLike,
  type CoverageFocusAreaLike,
  type CoverageRequirementLike,
  type CoverageShiftCategoryLike,
} from "./coverage";

function makeEmployee(overrides: Partial<CoverageEmployeeLike> = {}): CoverageEmployeeLike {
  return { id: "emp-1", ...overrides };
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
    minStaff: 3,
    ...overrides,
  };
}

describe("hasEffectiveCoverageRequirements", () => {
  it("is false with no rows", () => {
    expect(hasEffectiveCoverageRequirements([], [makeAssignment()])).toBe(false);
  });

  it("is false when every row asks for zero staff", () => {
    expect(
      hasEffectiveCoverageRequirements(
        [makeCoverageRequirement({ minStaff: 0 })],
        [makeAssignment()],
      ),
    ).toBe(false);
  });

  it("is false when no row resolves to an active assignment", () => {
    const orphaned = makeCoverageRequirement({ assignmentId: null, jobId: 9, preferredShiftId: 9 });
    const archived = makeCoverageRequirement({ assignmentId: 2 });
    expect(
      hasEffectiveCoverageRequirements(
        [orphaned, archived],
        [makeAssignment({ id: 2, archivedAt: "2026-01-01" })],
      ),
    ).toBe(false);
  });

  it("is true once one row resolves by assignment id or by job and shift", () => {
    expect(hasEffectiveCoverageRequirements([makeCoverageRequirement()], [makeAssignment()])).toBe(
      true,
    );
    expect(
      hasEffectiveCoverageRequirements(
        [makeCoverageRequirement({ assignmentId: null, jobId: 4, preferredShiftId: 7 })],
        [makeAssignment({ id: 5, jobId: 4, shiftId: 7 })],
      ),
    ).toBe(true);
  });
});

describe("resolveRequirementByAssignment", () => {
  it("returns day-specific match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, dayOfWeek: 1, minStaff: 5 }),
    ];
    expect(resolveRequirementByAssignment(reqs, 1, 10, 1)).toEqual({ minStaff: 5 });
  });

  it("falls back to every-day when no day-specific match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, dayOfWeek: null, minStaff: 3 }),
    ];
    expect(resolveRequirementByAssignment(reqs, 1, 10, 2)).toEqual({ minStaff: 3 });
  });

  it("returns null when neither day-specific nor every-day match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, dayOfWeek: 1, minStaff: 5 }),
    ];
    expect(resolveRequirementByAssignment(reqs, 1, 10, 3)).toBeNull();
  });
});

describe("computeCoverageStatus", () => {
  const date = new Date(2024, 0, 15);

  it("reports met when actual >= required", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    const result = computeCoverageStatus({
      employees: [emp1, emp2],
      date,
      assignmentIdsForKey: () => [10],
      sectionCodeIds: new Set([10]),
      eligibleAssignmentDefinitionIds: [10],
      requirement: { minStaff: 2 },
    });
    expect(result).toEqual({ actual: 2, required: 2, isMet: true, hasRequirement: true });
  });

  it("applies partial coverage credit for matching mentored assignments", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    const creditForKey = (empId: string) => (empId === "emp-1" ? 0.5 : 1);
    const result = computeCoverageStatus({
      employees: [emp1, emp2],
      date,
      assignmentIdsForKey: () => [10],
      sectionCodeIds: new Set([10]),
      eligibleAssignmentDefinitionIds: [10],
      requirement: { minStaff: 2 },
      coverageCreditForKey: creditForKey,
    });
    expect(result.actual).toBe(1.5);
    expect(result.isMet).toBe(false);
  });

  it("sums fractional credit without float noise", () => {
    const credits: Record<string, number> = { a: 0.7, b: 0.6, c: 0.7 };
    const result = computeCoverageStatus({
      employees: ["a", "b", "c"].map((id) => makeEmployee({ id })),
      date,
      assignmentIdsForKey: () => [10],
      sectionCodeIds: new Set([10]),
      eligibleAssignmentDefinitionIds: [10],
      requirement: { minStaff: 2 },
      coverageCreditForKey: (empId: string) => credits[empId],
    });
    expect(result.actual).toBe(2);
    expect(result.isMet).toBe(true);
  });
});

describe("computeCoverageGaps / computeCoverageCategorySnapshots", () => {
  const date = new Date(2024, 0, 15); // Monday

  it("names each row by its requirement, stable across dates, for both requirement models", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const legacyCode = makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const currentCode = makeAssignment({
      id: 20,
      label: "D-MA",
      categoryId: 1,
      shiftId: 1,
      jobId: 5,
      focusAreaId: 1,
    });
    const legacy = makeCoverageRequirement({ focusAreaId: 1, assignmentId: 10, minStaff: 2 });
    const current = makeCoverageRequirement({
      focusAreaId: 1,
      assignmentId: null,
      jobId: 5,
      preferredShiftId: 1,
      minStaff: 1,
    });
    const nextDay = new Date(2024, 0, 16);

    const snapshots = computeCoverageCategorySnapshots({
      focusAreas: [fa],
      shiftCategories: [cat],
      assignments: [legacyCode, currentCode],
      requirements: [legacy, current],
      dates: [date, nextDay],
      employeesByFocusArea: new Map([[1, []]]),
      assignmentIdsForKey: () => [],
      assignmentIdsByFocusArea: new Map([[1, new Set([10, 20])]]),
      assignmentNameMap: new Map([[20, "Day Shift · Med Aide"]]),
    });

    const rows = snapshots.map((snapshot) => [snapshot.rowKey, snapshot.rowLabel]);
    expect(rows).toEqual([
      ["1:1", "Day"],
      ["1:1", "Day"],
      ["1:5:1", "Day Shift · Med Aide"],
      ["1:5:1", "Day Shift · Med Aide"],
    ]);
  });

  it("returns a gap with real actual/required numbers when understaffed", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const code = makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const req = makeCoverageRequirement({
      focusAreaId: 1,
      assignmentId: 10,
      dayOfWeek: null,
      minStaff: 3,
    });
    const emp1 = makeEmployee({ id: "emp-1" });

    const gaps = computeCoverageGaps({
      focusAreas: [fa],
      shiftCategories: [cat],
      assignments: [code],
      requirements: [req],
      dates: [date],
      employeesByFocusArea: new Map([[1, [emp1]]]),
      assignmentIdsForKey: () => [10],
      assignmentIdsByFocusArea: new Map([[1, new Set([10])]]),
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].status.actual).toBe(1);
    expect(gaps[0].status.required).toBe(3);
  });

  it("returns empty when all requirements met", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const code = makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const req = makeCoverageRequirement({
      focusAreaId: 1,
      assignmentId: 10,
      dayOfWeek: null,
      minStaff: 1,
    });
    const emp = makeEmployee({ id: "emp-1" });

    const gaps = computeCoverageGaps({
      focusAreas: [fa],
      shiftCategories: [cat],
      assignments: [code],
      requirements: [req],
      dates: [date],
      employeesByFocusArea: new Map([[1, [emp]]]),
      assignmentIdsForKey: () => [10],
      assignmentIdsByFocusArea: new Map([[1, new Set([10])]]),
    });
    expect(gaps).toEqual([]);
  });
});

describe("summarizeCoverageTotals", () => {
  it("sums required/filled across snapshots, capping filled at required", () => {
    const snapshots = [
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        shiftCategoryId: 1,

        shiftCategoryName: "Day",

        rowKey: "1:1",

        rowLabel: "Day",
        date: new Date(),
        status: { actual: 2, required: 3, isMet: false, hasRequirement: true },
        eligibleAssignmentDefinitionIds: [],
        preferredOpenAssignmentDefinitionId: 1,
        shortageDetails: [],
      },
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        shiftCategoryId: 2,

        shiftCategoryName: "Night",

        rowKey: "1:2",

        rowLabel: "Night",
        date: new Date(),
        // over-staffed slot: actual must not inflate totalFilled beyond required
        status: { actual: 5, required: 2, isMet: true, hasRequirement: true },
        eligibleAssignmentDefinitionIds: [],
        preferredOpenAssignmentDefinitionId: 1,
        shortageDetails: [],
      },
    ];

    const totals = summarizeCoverageTotals(snapshots);
    expect(totals.totalRequired).toBe(5);
    expect(totals.totalFilled).toBe(4); // min(2,3) + min(5,2)
    expect(totals.pct).toBe(80);
    expect(totals.openSlots).toBe(1);
  });

  it("defaults to 100% when there is no requirement", () => {
    expect(summarizeCoverageTotals([])).toEqual({
      totalRequired: 0,
      totalFilled: 0,
      pct: 100,
      openSlots: 0,
    });
  });
});

describe("summarizeCoverageByFocusArea", () => {
  it("aggregates per focus area and filters out zero-requirement sections", () => {
    const focusAreas = [
      makeFocusArea({ id: 1, name: "ICU" }),
      makeFocusArea({ id: 2, name: "ER" }),
    ];
    const snapshots = [
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        shiftCategoryId: 1,

        shiftCategoryName: "Day",

        rowKey: "1:1",

        rowLabel: "Day",
        date: new Date(),
        status: { actual: 1, required: 2, isMet: false, hasRequirement: true },
        eligibleAssignmentDefinitionIds: [],
        preferredOpenAssignmentDefinitionId: 1,
        shortageDetails: [],
      },
      {
        focusAreaId: 2,
        focusAreaName: "ER",
        shiftCategoryId: 1,

        shiftCategoryName: "Day",

        rowKey: "1:1",

        rowLabel: "Day",
        date: new Date(),
        status: { actual: 0, required: 0, isMet: true, hasRequirement: false },
        eligibleAssignmentDefinitionIds: [],
        preferredOpenAssignmentDefinitionId: 1,
        shortageDetails: [],
      },
    ];

    const result = summarizeCoverageByFocusArea(snapshots, focusAreas);
    expect(result).toEqual([
      { focusAreaId: 1, focusAreaName: "ICU", filledTotal: 1, requiredTotal: 2, pct: 50 },
    ]);
  });
});

describe("summarizeCoverageDailyForFocusArea", () => {
  it("answers one entry per requested date with the day's staffing status", () => {
    const monday = new Date(2026, 8, 21);
    const tuesday = new Date(2026, 8, 22);
    const wednesday = new Date(2026, 8, 23);
    const base = {
      focusAreaId: 1,
      focusAreaName: "ICU",
      shiftCategoryId: 1,

      shiftCategoryName: "Day",

      rowKey: "1:1",

      rowLabel: "Day",
      eligibleAssignmentDefinitionIds: [],
      preferredOpenAssignmentDefinitionId: 1,
      shortageDetails: [],
    };
    const snapshots = [
      {
        ...base,
        date: monday,
        status: { actual: 2, required: 2, isMet: true, hasRequirement: true },
      },
      {
        ...base,
        date: monday,
        shiftCategoryId: 2,
        status: { actual: 3, required: 1, isMet: true, hasRequirement: true },
      },
      {
        ...base,
        date: tuesday,
        status: { actual: 1, required: 3, isMet: false, hasRequirement: true },
      },
      {
        ...base,
        focusAreaId: 2,
        date: wednesday,
        status: { actual: 0, required: 5, isMet: false, hasRequirement: true },
      },
    ];

    expect(summarizeCoverageDailyForFocusArea(snapshots, 1, [monday, tuesday, wednesday])).toEqual([
      { dateKey: "2026-09-21", filledCount: 3, requiredCount: 3, status: "green" },
      { dateKey: "2026-09-22", filledCount: 1, requiredCount: 3, status: "amber" },
      { dateKey: "2026-09-23", filledCount: 0, requiredCount: 0, status: "none" },
    ]);
    expect(summarizeCoverageDailyForFocusArea(snapshots, 2, [wednesday])).toEqual([
      { dateKey: "2026-09-23", filledCount: 0, requiredCount: 5, status: "red" },
    ]);
  });
});

describe("classifyOpenShiftUrgency", () => {
  const today = new Date(2026, 6, 11);

  it("classifies today/tomorrow as high", () => {
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 11), today)).toBe("high");
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 12), today)).toBe("high");
  });

  it("classifies 2-3 days out as medium", () => {
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 13), today)).toBe("medium");
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 14), today)).toBe("medium");
  });

  it("classifies further out (or past) as low", () => {
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 15), today)).toBe("low");
    expect(classifyOpenShiftUrgency(new Date(2026, 6, 10), today)).toBe("low");
  });
});

describe("cross-platform parity", () => {
  // Regression test: web (dashboard-stats.ts) and mobile
  // (mobile-api-core/dashboard.ts) both compute coverage % by feeding
  // computeCoverageCategorySnapshots() through summarizeCoverageTotals() /
  // summarizeCoverageByFocusArea(). Since both call sites share this exact
  // function, the same fixture must always produce identical numbers
  // regardless of which "platform-shaped" call constructed the snapshots.
  it("produces identical totals for web-shaped and mobile-shaped calls over the same fixture", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const mentoredCode = makeAssignment({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const req = makeCoverageRequirement({
      focusAreaId: 1,
      assignmentId: 10,
      dayOfWeek: null,
      minStaff: 3,
    });
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" }); // mentored, 50% credit
    const emp3 = makeEmployee({ id: "emp-3" });
    const date = new Date(2024, 0, 15);

    const buildSnapshots = () =>
      computeCoverageCategorySnapshots({
        focusAreas: [fa],
        shiftCategories: [cat],
        assignments: [mentoredCode],
        requirements: [req],
        dates: [date],
        employeesByFocusArea: new Map([[1, [emp1, emp2, emp3]]]),
        assignmentIdsForKey: () => [10],
        assignmentIdsByFocusArea: buildAssignmentDefinitionIdsByFocusArea([fa], [mentoredCode]),
        coverageCreditForKey: (empId) => (empId === "emp-2" ? 0.5 : 1),
      });

    // "web-shaped" call and "mobile-shaped" call are literally the same
    // function today (that's the point of the fix) — assert both produce
    // identical aggregate totals from independently-built snapshot arrays.
    const webSnapshots = buildSnapshots();
    const mobileSnapshots = buildSnapshots();

    const webTotals = summarizeCoverageTotals(webSnapshots);
    const mobileTotals = summarizeCoverageTotals(mobileSnapshots);
    expect(mobileTotals).toEqual(webTotals);
    expect(webTotals.totalFilled).toBe(2.5);
    expect(webTotals.totalRequired).toBe(3);

    const webByFocusArea = summarizeCoverageByFocusArea(webSnapshots, [fa]);
    const mobileByFocusArea = summarizeCoverageByFocusArea(mobileSnapshots, [fa]);
    expect(mobileByFocusArea).toEqual(webByFocusArea);
  });
});

describe("the day off absence", () => {
  const types = [
    { id: 1, name: "Paid Time Off", label: "PTO" },
    { id: 2, name: "Sick", label: "S" },
    { id: 3, name: "Off", label: "X" },
    { id: 4, name: "Vacation", label: "V", archivedAt: "2026-01-01" },
  ];

  it("keeps a saved choice, a saved none, and leaves it out when nothing was saved", () => {
    expect(normalizeCoverageRuleConfig({ dayOffAbsenceTypeId: 3 }).dayOffAbsenceTypeId).toBe(3);
    expect(
      normalizeCoverageRuleConfig({ dayOffAbsenceTypeId: null }).dayOffAbsenceTypeId,
    ).toBeNull();
    expect("dayOffAbsenceTypeId" in normalizeCoverageRuleConfig({})).toBe(false);
    expect("dayOffAbsenceTypeId" in normalizeCoverageRuleConfig({ dayOffAbsenceTypeId: "3" })).toBe(
      false,
    );
  });

  it("detects it by name, never by a name that only contains off", () => {
    expect(resolveDayOffAbsenceType({}, types)).toEqual({ absenceType: types[2], detected: true });
    expect(resolveDayOffAbsenceType({}, types.slice(0, 2))).toBeNull();
  });

  it("detects it by code when no name matches", () => {
    const coded = [{ id: 9, name: "Weekly rest", label: "RDO" }];
    expect(resolveDayOffAbsenceType(undefined, coded)?.absenceType.id).toBe(9);
  });

  it("uses a saved choice, ignores an archived one, and honours none", () => {
    expect(resolveDayOffAbsenceType({ dayOffAbsenceTypeId: 2 }, types)).toEqual({
      absenceType: types[1],
      detected: false,
    });
    expect(resolveDayOffAbsenceType({ dayOffAbsenceTypeId: 4 }, types)).toBeNull();
    expect(resolveDayOffAbsenceType({ dayOffAbsenceTypeId: null }, types)).toBeNull();
  });
});

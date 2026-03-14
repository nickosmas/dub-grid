import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies, filterAndSortEmployees } from "@/lib/schedule-logic";
import { Employee, ShiftCode } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    name: "Test Employee",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    ...overrides,
  };
}

function makeShiftCode(overrides: Partial<ShiftCode> = {}): ShiftCode {
  return {
    id: 1,
    orgId: "org1",
    label: "D",
    name: "Day",
    color: "#fff",
    border: "#ccc",
    text: "#000",
    sortOrder: 1,
    categoryId: null,
    ...overrides,
  };
}

// Category IDs used in tests
const CAT_DAY = 1;
const CAT_EVE = 2;
const CAT_NIGHT = 3;

// ── 7.1 ShiftMap key format unit tests ───────────────────────────────────────

describe("ShiftMap key format", () => {
  it("produces the expected key for a known empId and date", () => {
    const empId = "emp-42";
    const date = new Date(2024, 0, 15); // Jan 15, 2024
    const key = `${empId}_${formatDateKey(date)}`;
    expect(key).toBe("emp-42_2024-01-15");
  });

  it("matches the pattern used by fetchShifts in db.ts", () => {
    // fetchShifts builds keys as `${row.emp_id}_${row.date}` where row.date is YYYY-MM-DD
    const empId = "emp-7";
    const date = new Date(2024, 11, 31); // Dec 31, 2024
    const key = `${empId}_${formatDateKey(date)}`;
    expect(key).toMatch(/^.+_\d{4}-\d{2}-\d{2}$/);
    expect(key).toBe("emp-7_2024-12-31");
  });

  it("zero-pads month and day correctly", () => {
    const empId = "emp-1";
    const date = new Date(2024, 0, 5); // Jan 5
    const key = `${empId}_${formatDateKey(date)}`;
    expect(key).toBe("emp-1_2024-01-05");
  });
});

// ── 7.2 Property 10: ShiftMap key format validity ─────────────────────────────

describe("Property 10: ShiftMap key format validity", () => {
  // Feature: comprehensive-test-suite, Property 10: ShiftMap key format validity
  it("key always matches /^.+_\\d{4}-\\d{2}-\\d{2}$/ for any empId and date", () => {
    const arbDate = fc.date({
      min: new Date("2000-01-01"),
      max: new Date("2099-12-31"),
      noInvalidDate: true,
    });
    const arbEmpId = fc.uuid();

    fc.assert(
      fc.property(arbEmpId, arbDate, (empId, date) => {
        const key = `${empId}_${formatDateKey(date)}`;
        expect(key).toMatch(/^.+_\d{4}-\d{2}-\d{2}$/);
      }),
    );
  });
});

// ── 7.3 FTE aggregation unit tests ───────────────────────────────────────────

describe("computeDailyTallies", () => {
  const date = new Date(2024, 0, 15);

  // Helper: build a Map<number, ShiftCode> from an array of shift codes
  function buildCodeMap(...codes: ShiftCode[]): Map<number, ShiftCode> {
    return new Map(codes.map((c) => [c.id, c]));
  }

  it("returns empty object when there are no employees", () => {
    const result = computeDailyTallies([], date, () => [], new Map(), new Set());
    expect(result).toEqual({});
  });

  it("counts day FTE correctly", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    const dayCode = makeShiftCode({ id: 10, label: "D", categoryId: CAT_DAY });
    const codeMap = buildCodeMap(dayCode);
    const sectionIds = new Set([10]);

    const idsForKey = () => [10];
    const result = computeDailyTallies([emp1, emp2], date, idsForKey, codeMap, sectionIds);
    expect(result[CAT_DAY]["D"]).toBe(2);
    expect(result[CAT_EVE]).toBeUndefined();
    expect(result[CAT_NIGHT]).toBeUndefined();
  });

  it("counts eve FTE correctly", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const eveCode = makeShiftCode({ id: 20, label: "E", categoryId: CAT_EVE });
    const codeMap = buildCodeMap(eveCode);
    const sectionIds = new Set([20]);

    const result = computeDailyTallies([emp], date, () => [20], codeMap, sectionIds);
    expect(result[CAT_DAY]).toBeUndefined();
    expect(result[CAT_EVE]["E"]).toBe(1);
    expect(result[CAT_NIGHT]).toBeUndefined();
  });

  it("counts night FTE correctly", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const nightCode = makeShiftCode({ id: 30, label: "N", categoryId: CAT_NIGHT });
    const codeMap = buildCodeMap(nightCode);
    const sectionIds = new Set([30]);

    const result = computeDailyTallies([emp], date, () => [30], codeMap, sectionIds);
    expect(result[CAT_DAY]).toBeUndefined();
    expect(result[CAT_EVE]).toBeUndefined();
    expect(result[CAT_NIGHT]["N"]).toBe(1);
  });

  it("each employee contributes 1 to headcount", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const dayCode = makeShiftCode({ id: 10, label: "D", categoryId: CAT_DAY });
    const codeMap = buildCodeMap(dayCode);
    const sectionIds = new Set([10]);

    const result = computeDailyTallies([emp], date, () => [10], codeMap, sectionIds);
    expect(result[CAT_DAY]["D"]).toBe(1);
  });

  it("sums headcount across multiple employees", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    const dayCode = makeShiftCode({ id: 10, label: "D", categoryId: CAT_DAY });
    const codeMap = buildCodeMap(dayCode);
    const sectionIds = new Set([10]);

    const result = computeDailyTallies([emp1, emp2], date, () => [10], codeMap, sectionIds);
    expect(result[CAT_DAY]["D"]).toBe(2);
  });

  it("employees with no shift assigned do not contribute to counts", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const dayCode = makeShiftCode({ id: 10, label: "D", categoryId: CAT_DAY });
    const codeMap = buildCodeMap(dayCode);
    const sectionIds = new Set([10]);

    const result = computeDailyTallies([emp], date, () => [], codeMap, sectionIds);
    expect(result).toEqual({});
  });

  it("shifts with no categoryId do not appear in tallies", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const uncategorized = makeShiftCode({ id: 10, label: "D", categoryId: null });
    const codeMap = buildCodeMap(uncategorized);
    const sectionIds = new Set([10]);

    const result = computeDailyTallies([emp], date, () => [10], codeMap, sectionIds);
    expect(result).toEqual({});
  });

  it("shift codes not in sectionCodeIds are excluded from tallies", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const otherAreaCode = makeShiftCode({ id: 99, label: "D", categoryId: CAT_DAY });
    const codeMap = buildCodeMap(otherAreaCode);
    const sectionIds = new Set([10]); // 99 is NOT in this set

    const result = computeDailyTallies([emp], date, () => [99], codeMap, sectionIds);
    expect(result).toEqual({});
  });

  it("counts multiple shifts for a single employee (D/E)", () => {
    const emp = makeEmployee({ id: "emp-1" });
    const dayCode = makeShiftCode({ id: 10, label: "D", categoryId: CAT_DAY });
    const eveCode = makeShiftCode({ id: 20, label: "E", categoryId: CAT_EVE });
    const codeMap = buildCodeMap(dayCode, eveCode);
    const sectionIds = new Set([10, 20]);

    const result = computeDailyTallies([emp], date, () => [10, 20], codeMap, sectionIds);
    expect(result[CAT_DAY]["D"]).toBe(1);
    expect(result[CAT_EVE]["E"]).toBe(1);
    expect(result[CAT_NIGHT]).toBeUndefined();
  });
});

// ── 7.4 Property 11: FTE aggregation correctness ─────────────────────────────

describe("Property 11: headcount aggregation correctness across all count types", () => {
  // Feature: comprehensive-test-suite, Property 11: headcount aggregation correctness across all count types
  it("computed counts equal exact headcount (1 per employee) for matching shift categoryId", () => {
    const arbCategoryId = fc.oneof(
      fc.constant(CAT_DAY),
      fc.constant(CAT_EVE),
      fc.constant(CAT_NIGHT),
      fc.constant(null as number | null),
    );

    const arbEntry = fc.record({
      categoryId: arbCategoryId,
      hasShift: fc.boolean(),
    });

    fc.assert(
      fc.property(
        fc.array(arbEntry, { minLength: 0, maxLength: 15 }),
        (entries) => {
          const date = new Date(2024, 0, 15);

          const employees: Employee[] = entries.map((_, i) =>
            makeEmployee({ id: `emp-${i + 1}` }),
          );

          // Each entry gets a unique shift code ID (starting at 100)
          const codes: ShiftCode[] = entries.map((e, i) =>
            makeShiftCode({ id: 100 + i, label: `SHIFT_${i}`, categoryId: e.categoryId }),
          );

          const codeMap = new Map(codes.map((c) => [c.id, c]));
          const sectionIds = new Set(codes.map((c) => c.id));

          const shiftCodeIdsForKey = (empId: string): number[] => {
            const match = empId.match(/^emp-(\d+)$/);
            if (!match) return [];
            const idx = parseInt(match[1], 10) - 1;
            if (idx < 0 || idx >= entries.length) return [];
            return entries[idx].hasShift ? [100 + idx] : [];
          };

          const result = computeDailyTallies(
            employees,
            date,
            shiftCodeIdsForKey,
            codeMap,
            sectionIds,
          );

          // Compute expected headcounts per category
          const expectedCounts: Record<number, number> = {};
          entries.forEach((e) => {
            if (e.hasShift && e.categoryId != null) {
              expectedCounts[e.categoryId] = (expectedCounts[e.categoryId] ?? 0) + 1;
            }
          });

          const sumTally = (tally: Record<string, number>) =>
            Object.values(tally).reduce((a, b) => a + b, 0);

          for (const catId of [CAT_DAY, CAT_EVE, CAT_NIGHT]) {
            const expected = expectedCounts[catId] ?? 0;
            const actual = result[catId] ? sumTally(result[catId]) : 0;
            expect(actual).toBe(expected);
          }
        },
      ),
    );
  });
});

// ── 7.5 Employee filtering/sorting unit tests ─────────────────────────────────

describe("filterAndSortEmployees", () => {
  const employees: Employee[] = [
    makeEmployee({ id: "emp-1", focusAreaIds: [1], seniority: 3 }),
    makeEmployee({ id: "emp-2", focusAreaIds: [2], seniority: 1 }),
    makeEmployee({ id: "emp-3", focusAreaIds: [1, 2], seniority: 2 }),
    makeEmployee({ id: "emp-4", focusAreaIds: [], seniority: 0 }), // no focusAreaIds — always excluded
    makeEmployee({ id: "emp-5", focusAreaIds: [3], seniority: 5 }),
  ];

  it('null filter (All) includes all employees with at least one focus area', () => {
    const result = filterAndSortEmployees(employees, null);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("emp-1");
    expect(ids).toContain("emp-2");
    expect(ids).toContain("emp-3");
    expect(ids).toContain("emp-5");
  });

  it('null filter (All) excludes employees with empty focus areas', () => {
    const result = filterAndSortEmployees(employees, null);
    expect(result.map((e) => e.id)).not.toContain("emp-4");
  });

  it("specific focus area filter includes only matching employees", () => {
    const result = filterAndSortEmployees(employees, 1);
    const ids = result.map((e) => e.id);
    expect(ids).toContain("emp-1");
    expect(ids).toContain("emp-3");
    expect(ids).not.toContain("emp-2");
    expect(ids).not.toContain("emp-5");
  });

  it("specific focus area filter excludes employees with empty focus areas", () => {
    const result = filterAndSortEmployees(employees, 1);
    expect(result.map((e) => e.id)).not.toContain("emp-4");
  });

  it("result is sorted in ascending order by seniority", () => {
    const result = filterAndSortEmployees(employees, null);
    const seniorities = result.map((e) => e.seniority);
    for (let i = 1; i < seniorities.length; i++) {
      expect(seniorities[i]).toBeGreaterThanOrEqual(seniorities[i - 1]);
    }
  });

  it("returns empty array when no employees match the focus area filter", () => {
    const result = filterAndSortEmployees(employees, 999);
    expect(result).toHaveLength(0);
  });
});

// ── 7.6 Property 12: Employee filter correctness and sort order ───────────────

describe("Property 12: Employee filter correctness and sort order", () => {
  // Feature: comprehensive-test-suite, Property 12: Employee filter correctness and sort order
  it("filtered result satisfies focus area inclusion, empty exclusion, and seniority sort", () => {
    const arbFocusAreaId = fc.constantFrom(1, 2, 3, 4);
    const arbEmployee = fc.record({
      id: fc.uuid(),
      seniority: fc.integer({ min: 1, max: 1000 }),
      focusAreaIds: fc.array(arbFocusAreaId, { minLength: 0, maxLength: 3 }),
    }).map((e) =>
      makeEmployee({
        id: e.id,
        seniority: e.seniority,
        focusAreaIds: [...new Set(e.focusAreaIds)],
      }),
    );

    const arbFilter = fc.oneof(fc.constant(null as number | null), arbFocusAreaId);

    fc.assert(
      fc.property(
        fc.array(arbEmployee, { minLength: 0, maxLength: 20 }),
        arbFilter,
        (employeesRaw, activeFocusAreaId) => {
          const employees = employeesRaw.filter((e, idx, arr) => arr.findIndex(x => x.id === e.id) === idx);
          const result = filterAndSortEmployees(employees, activeFocusAreaId);

          // (a) All results must have non-empty focusAreaIds
          for (const emp of result) {
            expect(emp.focusAreaIds.length).toBeGreaterThan(0);
          }

          // (b) Focus area inclusion rule
          for (const emp of result) {
            if (activeFocusAreaId === null) {
              expect(emp.focusAreaIds.length).toBeGreaterThan(0);
            } else {
              expect(emp.focusAreaIds).toContain(activeFocusAreaId);
            }
          }

          // (c) Employees with empty focusAreaIds must be excluded
          const emptyFocusAreaEmployees = employees.filter((e) => e.focusAreaIds.length === 0);
          for (const emp of emptyFocusAreaEmployees) {
            expect(result.map((r) => r.id)).not.toContain(emp.id);
          }

          // (d) Sorted in non-decreasing order of seniority
          for (let i = 1; i < result.length; i++) {
            expect(result[i].seniority).toBeGreaterThanOrEqual(result[i - 1].seniority);
          }
        },
      ),
    );
  });
});

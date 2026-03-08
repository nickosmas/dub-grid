import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { formatDateKey } from "@/lib/utils";
import { computeDailyCounts, filterAndSortEmployees } from "@/lib/schedule-logic";
import { Employee, ShiftType } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    name: "Test Employee",
    designation: "STAFF",
    roles: [],
    fteWeight: 1,
    seniority: 1,
    wings: ["A"],
    phone: "",
    email: "",
    contactNotes: "",
    ...overrides,
  };
}

function makeShiftType(overrides: Partial<ShiftType> = {}): ShiftType {
  return {
    id: 1,
    orgId: "org1",
    label: "D",
    name: "Day",
    color: "#fff",
    border: "#ccc",
    text: "#000",
    sortOrder: 1,
    ...overrides,
  };
}

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

describe("computeDailyCounts", () => {
  const date = new Date(2024, 0, 15);

  it("returns all zeros when there are no employees", () => {
    const result = computeDailyCounts([], date, () => null, () => makeShiftType());
    expect(result).toEqual({ day: 0, eve: 0, night: 0 });
  });

  it("counts day FTE correctly", () => {
    const emp1 = makeEmployee({ id: "emp-1", fteWeight: 1 });
    const emp2 = makeEmployee({ id: "emp-2", fteWeight: 1 });
    const dayShift = makeShiftType({ label: "D", countsTowardDay: true });

    const shiftForKey = (empId: string) => (empId === "emp-1" || empId === "emp-2" ? "D" : null);
    const getShiftStyle = () => dayShift;

    const result = computeDailyCounts([emp1, emp2], date, shiftForKey, getShiftStyle);
    expect(result.day).toBe(2);
    expect(result.eve).toBe(0);
    expect(result.night).toBe(0);
  });

  it("counts eve FTE correctly", () => {
    const emp = makeEmployee({ id: "emp-1", fteWeight: 1 });
    const eveShift = makeShiftType({ label: "E", countsTowardEve: true });

    const result = computeDailyCounts(
      [emp],
      date,
      () => "E",
      () => eveShift,
    );
    expect(result.day).toBe(0);
    expect(result.eve).toBe(1);
    expect(result.night).toBe(0);
  });

  it("counts night FTE correctly", () => {
    const emp = makeEmployee({ id: "emp-1", fteWeight: 1 });
    const nightShift = makeShiftType({ label: "N", countsTowardNight: true });

    const result = computeDailyCounts(
      [emp],
      date,
      () => "N",
      () => nightShift,
    );
    expect(result.day).toBe(0);
    expect(result.eve).toBe(0);
    expect(result.night).toBe(1);
  });

  it("preserves fractional fteWeight (0.5)", () => {
    const emp = makeEmployee({ id: "emp-1", fteWeight: 0.5 });
    const dayShift = makeShiftType({ label: "D", countsTowardDay: true });

    const result = computeDailyCounts(
      [emp],
      date,
      () => "D",
      () => dayShift,
    );
    expect(result.day).toBeCloseTo(0.5);
  });

  it("sums fractional weights across multiple employees", () => {
    const emp1 = makeEmployee({ id: "emp-1", fteWeight: 0.5 });
    const emp2 = makeEmployee({ id: "emp-2", fteWeight: 0.5 });
    const dayShift = makeShiftType({ label: "D", countsTowardDay: true });

    const result = computeDailyCounts(
      [emp1, emp2],
      date,
      () => "D",
      () => dayShift,
    );
    expect(result.day).toBeCloseTo(1.0);
  });

  it("employees with no shift assigned do not contribute to counts", () => {
    const emp = makeEmployee({ id: "emp-1", fteWeight: 1 });

    const result = computeDailyCounts(
      [emp],
      date,
      () => null,
      () => makeShiftType({ countsTowardDay: true }),
    );
    expect(result).toEqual({ day: 0, eve: 0, night: 0 });
  });
});

// ── 7.4 Property 11: FTE aggregation correctness ─────────────────────────────

describe("Property 11: FTE aggregation correctness across all count types", () => {
  // Feature: comprehensive-test-suite, Property 11: FTE aggregation correctness across all count types
  it("computed counts equal exact sum of fteWeight for matching shift flags", () => {
    const arbFteWeight = fc.double({ min: 0.1, max: 2.0, noNaN: true, noDefaultInfinity: true });
    const arbBool = fc.boolean();

    // Each entry: employee data + shift type flags
    const arbEntry = fc.record({
      fteWeight: arbFteWeight,
      countsTowardDay: arbBool,
      countsTowardEve: arbBool,
      countsTowardNight: arbBool,
      hasShift: arbBool, // whether this employee has a shift assigned at all
    });

    fc.assert(
      fc.property(
        fc.array(arbEntry, { minLength: 0, maxLength: 15 }),
        (entries) => {
          const date = new Date(2024, 0, 15);

          // Build employees and shift types with unique ids
          const employees: Employee[] = entries.map((e, i) =>
            makeEmployee({ id: `emp-${i + 1}`, fteWeight: e.fteWeight }),
          );

          const shiftTypes: ShiftType[] = entries.map((e, i) =>
            makeShiftType({
              label: `SHIFT_${i}`,
              countsTowardDay: e.countsTowardDay,
              countsTowardEve: e.countsTowardEve,
              countsTowardNight: e.countsTowardNight,
            }),
          );

          const shiftForKey = (empId: string): string | null => {
            const match = empId.match(/^emp-(\d+)$/);
            if (!match) return null;
            const idx = parseInt(match[1], 10) - 1;
            if (idx < 0 || idx >= entries.length) return null;
            return entries[idx].hasShift ? `SHIFT_${idx}` : null;
          };

          const getShiftStyle = (type: string): ShiftType => {
            const found = shiftTypes.find((st) => st.label === type);
            return found ?? makeShiftType({ label: type });
          };

          const result = computeDailyCounts(employees, date, shiftForKey, getShiftStyle);

          // Compute expected values manually
          let expectedDay = 0, expectedEve = 0, expectedNight = 0;
          entries.forEach((e, i) => {
            if (e.hasShift) {
              if (e.countsTowardDay) expectedDay += e.fteWeight;
              if (e.countsTowardEve) expectedEve += e.fteWeight;
              if (e.countsTowardNight) expectedNight += e.fteWeight;
            }
          });

          expect(result.day).toBeCloseTo(expectedDay, 10);
          expect(result.eve).toBeCloseTo(expectedEve, 10);
          expect(result.night).toBeCloseTo(expectedNight, 10);
        },
      ),
    );
  });
});

// ── 7.5 Employee filtering/sorting unit tests ─────────────────────────────────

describe("filterAndSortEmployees", () => {
  const employees: Employee[] = [
    makeEmployee({ id: "emp-1", wings: ["A"], seniority: 3 }),
    makeEmployee({ id: "emp-2", wings: ["B"], seniority: 1 }),
    makeEmployee({ id: "emp-3", wings: ["A", "B"], seniority: 2 }),
    makeEmployee({ id: "emp-4", wings: [], seniority: 0 }), // no wings — always excluded
    makeEmployee({ id: "emp-5", wings: ["C"], seniority: 5 }),
  ];

  it('"All" filter includes all employees with at least one wing', () => {
    const result = filterAndSortEmployees(employees, "All");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("emp-1");
    expect(ids).toContain("emp-2");
    expect(ids).toContain("emp-3");
    expect(ids).toContain("emp-5");
  });

  it('"All" filter excludes employees with empty wings', () => {
    const result = filterAndSortEmployees(employees, "All");
    expect(result.map((e) => e.id)).not.toContain("emp-4");
  });

  it("specific wing filter includes only matching employees", () => {
    const result = filterAndSortEmployees(employees, "A");
    const ids = result.map((e) => e.id);
    expect(ids).toContain("emp-1");
    expect(ids).toContain("emp-3");
    expect(ids).not.toContain("emp-2");
    expect(ids).not.toContain("emp-5");
  });

  it("specific wing filter excludes employees with empty wings", () => {
    const result = filterAndSortEmployees(employees, "A");
    expect(result.map((e) => e.id)).not.toContain("emp-4");
  });

  it("result is sorted in ascending order by seniority", () => {
    const result = filterAndSortEmployees(employees, "All");
    const seniorities = result.map((e) => e.seniority);
    for (let i = 1; i < seniorities.length; i++) {
      expect(seniorities[i]).toBeGreaterThanOrEqual(seniorities[i - 1]);
    }
  });

  it("returns empty array when no employees match the wing filter", () => {
    const result = filterAndSortEmployees(employees, "Z");
    expect(result).toHaveLength(0);
  });
});

// ── 7.6 Property 12: Employee filter correctness and sort order ───────────────

describe("Property 12: Employee filter correctness and sort order", () => {
  // Feature: comprehensive-test-suite, Property 12: Employee filter correctness and sort order
  it("filtered result satisfies wing inclusion, empty-wings exclusion, and seniority sort", () => {
    const arbWingName = fc.constantFrom("A", "B", "C", "D");
    const arbEmployee = fc.record({
      id: fc.uuid(),
      fteWeight: fc.double({ min: 0.1, max: 1.0, noNaN: true, noDefaultInfinity: true }),
      seniority: fc.integer({ min: 1, max: 1000 }),
      wings: fc.array(arbWingName, { minLength: 0, maxLength: 3 }),
    }).map((e) =>
      makeEmployee({
        id: e.id,
        fteWeight: e.fteWeight,
        seniority: e.seniority,
        wings: [...new Set(e.wings)] as string[], // deduplicate
      }),
    );

    const arbFilter = fc.oneof(fc.constant("All"), arbWingName);

    fc.assert(
      fc.property(
        fc.array(arbEmployee, { minLength: 0, maxLength: 20 }),
        arbFilter,
        (employeesRaw, activeWing) => {
          const employees = employeesRaw.filter((e, idx, arr) => arr.findIndex(x => x.id === e.id) === idx);
          const result = filterAndSortEmployees(employees, activeWing);

          // (a) All results must have non-empty wings
          for (const emp of result) {
            expect(emp.wings.length).toBeGreaterThan(0);
          }

          // (b) Wing inclusion rule
          for (const emp of result) {
            if (activeWing === "All") {
              expect(emp.wings.length).toBeGreaterThan(0);
            } else {
              expect(emp.wings).toContain(activeWing);
            }
          }

          // (c) Employees with empty wings must be excluded
          const emptyWingEmployees = employees.filter((e) => e.wings.length === 0);
          for (const emp of emptyWingEmployees) {
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

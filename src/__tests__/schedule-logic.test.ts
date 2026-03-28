import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  isEmployeeQualified,
  getDisqualificationReasons,
  rangesOverlap,
  timesOverlap,
  checkCrossDateOverlap,
  checkSameDayOverlaps,
  resolveRequirement,
  computeCoverageStatus,
  computeCoverageGaps,
} from "@/lib/schedule-logic";
import {
  makeEmployee,
  makeShiftCode,
  makeFocusArea,
  makeShiftCategory,
  makeCoverageRequirement,
} from "./factories";

// ── isEmployeeQualified ──────────────────────────────────────────────────────

describe("isEmployeeQualified", () => {
  it("returns true when shift has no restrictions", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [], focusAreaId: null });
    expect(isEmployeeQualified(emp, code)).toBe(true);
  });

  it("returns true when shift has undefined requiredCertificationIds", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: undefined, focusAreaId: null });
    expect(isEmployeeQualified(emp, code)).toBe(true);
  });

  it("returns true when employee has matching cert and focus area", () => {
    const emp = makeEmployee({ certificationId: 5, focusAreaIds: [1, 2] });
    const code = makeShiftCode({ requiredCertificationIds: [5, 6], focusAreaId: 2 });
    expect(isEmployeeQualified(emp, code)).toBe(true);
  });

  it("returns false when employee lacks required certification", () => {
    const emp = makeEmployee({ certificationId: 3, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5, 6], focusAreaId: null });
    expect(isEmployeeQualified(emp, code)).toBe(false);
  });

  it("returns false when employee has null certificationId and shift requires certs", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5], focusAreaId: null });
    expect(isEmployeeQualified(emp, code)).toBe(false);
  });

  it("returns false when employee is not in the shift focus area", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1, 3] });
    const code = makeShiftCode({ requiredCertificationIds: [], focusAreaId: 2 });
    expect(isEmployeeQualified(emp, code)).toBe(false);
  });

  it("returns false when employee has empty focusAreaIds and shift requires focus area", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [] });
    const code = makeShiftCode({ focusAreaId: 1 });
    expect(isEmployeeQualified(emp, code)).toBe(false);
  });

  it("returns false when both cert and focus area fail", () => {
    const emp = makeEmployee({ certificationId: 1, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5], focusAreaId: 2 });
    expect(isEmployeeQualified(emp, code)).toBe(false);
  });
});

// ── getDisqualificationReasons ───────────────────────────────────────────────

describe("getDisqualificationReasons", () => {
  it("returns empty array for qualified employee", () => {
    const emp = makeEmployee({ certificationId: 5, focusAreaIds: [2] });
    const code = makeShiftCode({ requiredCertificationIds: [5], focusAreaId: 2 });
    expect(getDisqualificationReasons(emp, code)).toEqual([]);
  });

  it("returns focus area reason with name from map", () => {
    const emp = makeEmployee({ focusAreaIds: [1] });
    const code = makeShiftCode({ focusAreaId: 2 });
    const faNames = new Map([[2, "Emergency"]]);
    const reasons = getDisqualificationReasons(emp, code, faNames);
    expect(reasons).toEqual(["not assigned to Emergency"]);
  });

  it("returns focus area reason with fallback ID when no name map", () => {
    const emp = makeEmployee({ focusAreaIds: [1] });
    const code = makeShiftCode({ focusAreaId: 2 });
    const reasons = getDisqualificationReasons(emp, code);
    expect(reasons).toEqual(["not assigned to focus area #2"]);
  });

  it("returns certification reason with name from map", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5], focusAreaId: null });
    const certNames = new Map([[5, "RN"]]);
    const reasons = getDisqualificationReasons(emp, code, undefined, certNames);
    expect(reasons).toEqual(["requires RN"]);
  });

  it("returns certification reason with fallback ID when no name map", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5, 6], focusAreaId: null });
    const reasons = getDisqualificationReasons(emp, code);
    expect(reasons).toEqual(["requires cert #5 or cert #6"]);
  });

  it("returns both reasons when both fail", () => {
    const emp = makeEmployee({ certificationId: null, focusAreaIds: [1] });
    const code = makeShiftCode({ requiredCertificationIds: [5], focusAreaId: 2 });
    const reasons = getDisqualificationReasons(emp, code);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toContain("not assigned to");
    expect(reasons[1]).toContain("requires");
  });

  it("consistency: reasons is empty iff isEmployeeQualified is true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, 1, 2, 3, 5, 6),
        fc.array(fc.constantFrom(1, 2, 3), { minLength: 0, maxLength: 3 }),
        fc.array(fc.constantFrom(1, 2, 5, 6), { minLength: 0, maxLength: 3 }),
        fc.constantFrom(null as number | null, 1, 2, 3),
        (certId, focusAreaIds, reqCerts, focusAreaId) => {
          const emp = makeEmployee({ certificationId: certId, focusAreaIds });
          const code = makeShiftCode({ requiredCertificationIds: reqCerts, focusAreaId });
          const qualified = isEmployeeQualified(emp, code);
          const reasons = getDisqualificationReasons(emp, code);
          expect(reasons.length === 0).toBe(qualified);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── rangesOverlap ────────────────────────────────────────────────────────────

describe("rangesOverlap", () => {
  it("returns false for non-overlapping daytime ranges", () => {
    expect(rangesOverlap({ start: "07:00", end: "15:00" }, { start: "15:00", end: "23:00" })).toBe(false);
  });

  it("returns true for overlapping daytime ranges", () => {
    expect(rangesOverlap({ start: "07:00", end: "16:00" }, { start: "15:00", end: "23:00" })).toBe(true);
  });

  it("returns true for identical ranges", () => {
    expect(rangesOverlap({ start: "07:00", end: "15:00" }, { start: "07:00", end: "15:00" })).toBe(true);
  });

  it("returns true when one range contains the other", () => {
    expect(rangesOverlap({ start: "06:00", end: "20:00" }, { start: "08:00", end: "16:00" })).toBe(true);
  });

  it("returns false for overnight shift a vs non-overlapping daytime b", () => {
    // 22:00-06:00 overnight; 10:00-18:00 daytime — no overlap
    expect(rangesOverlap({ start: "22:00", end: "06:00" }, { start: "10:00", end: "18:00" })).toBe(false);
  });

  it("returns true for overnight shift a vs early morning b", () => {
    // 22:00-06:00 overnight; 04:00-08:00 early morning — overlaps in 04:00-06:00
    expect(rangesOverlap({ start: "22:00", end: "06:00" }, { start: "04:00", end: "08:00" })).toBe(true);
  });

  it("returns true for overnight shift a vs late evening b", () => {
    // 22:00-06:00 overnight; 20:00-23:00 late evening — overlaps in 22:00-23:00
    expect(rangesOverlap({ start: "22:00", end: "06:00" }, { start: "20:00", end: "23:00" })).toBe(true);
  });

  it("returns true for both overnight shifts overlapping", () => {
    expect(rangesOverlap({ start: "22:00", end: "06:00" }, { start: "23:00", end: "07:00" })).toBe(true);
  });

  it("returns false for adjacent but non-overlapping ranges (strict <)", () => {
    // start < end is strict, so 15:00 === 15:00 is not less than
    expect(rangesOverlap({ start: "07:00", end: "15:00" }, { start: "15:00", end: "23:00" })).toBe(false);
  });

  it("is commutative: overlap(a, b) === overlap(b, a)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        (h1, h2, h3, h4) => {
          const pad = (n: number) => String(n).padStart(2, "0") + ":00";
          const a = { start: pad(h1), end: pad(h2) };
          const b = { start: pad(h3), end: pad(h4) };
          expect(rangesOverlap(a, b)).toBe(rangesOverlap(b, a));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── timesOverlap ─────────────────────────────────────────────────────────────

describe("timesOverlap", () => {
  it("returns false for empty arrays", () => {
    expect(timesOverlap([], [])).toBe(false);
  });

  it("returns false when one array is empty", () => {
    expect(timesOverlap([{ start: "07:00", end: "15:00" }], [])).toBe(false);
  });

  it("returns true when one pair overlaps", () => {
    const a = [{ start: "07:00", end: "16:00" }];
    const b = [{ start: "15:00", end: "23:00" }];
    expect(timesOverlap(a, b)).toBe(true);
  });

  it("returns false when no pairs overlap", () => {
    const a = [{ start: "07:00", end: "12:00" }];
    const b = [{ start: "13:00", end: "18:00" }];
    expect(timesOverlap(a, b)).toBe(false);
  });
});

// ── checkCrossDateOverlap ────────────────────────────────────────────────────

describe("checkCrossDateOverlap", () => {
  it("returns empty when normal daytime shift and no adjacent", () => {
    const warnings = checkCrossDateOverlap(
      { start: "07:00", end: "15:00" },
      { prev: null, next: null },
    );
    expect(warnings).toEqual([]);
  });

  it("returns empty when normal daytime shift with non-overnight adjacent", () => {
    const warnings = checkCrossDateOverlap(
      { start: "07:00", end: "15:00" },
      { prev: { start: "07:00", end: "15:00" }, next: { start: "07:00", end: "15:00" } },
    );
    expect(warnings).toEqual([]);
  });

  it("warns when overnight new shift overlaps next day shift", () => {
    // New: 22:00-06:00 (overnight), next day: 04:00-12:00 — tail 00:00-06:00 overlaps 04:00-12:00
    const warnings = checkCrossDateOverlap(
      { start: "22:00", end: "06:00" },
      { next: { start: "04:00", end: "12:00" } },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("next day");
  });

  it("no warning when overnight new shift tail does not overlap next day", () => {
    // New: 22:00-02:00 (overnight), next day: 07:00-15:00 — no overlap
    const warnings = checkCrossDateOverlap(
      { start: "22:00", end: "02:00" },
      { next: { start: "07:00", end: "15:00" } },
    );
    expect(warnings).toEqual([]);
  });

  it("warns when previous day overnight shift bleeds into today", () => {
    // Prev: 22:00-06:00 (overnight), new: 04:00-12:00 — prev tail 00:00-06:00 overlaps 04:00-12:00
    const warnings = checkCrossDateOverlap(
      { start: "04:00", end: "12:00" },
      { prev: { start: "22:00", end: "06:00" } },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("yesterday");
  });

  it("no warning when previous day overnight shift tail does not overlap", () => {
    // Prev: 22:00-02:00, new: 07:00-15:00 — prev tail 00:00-02:00 doesn't overlap 07:00-15:00
    const warnings = checkCrossDateOverlap(
      { start: "07:00", end: "15:00" },
      { prev: { start: "22:00", end: "02:00" } },
    );
    expect(warnings).toEqual([]);
  });

  it("normalizes 00:00 end time to 24:00", () => {
    // End of "00:00" means end-of-day (24:00), not start of day
    // New: 20:00-00:00 → 20:00-24:00 (NOT overnight), next: 07:00-15:00 → no overlap
    const warnings = checkCrossDateOverlap(
      { start: "20:00", end: "00:00" },
      { next: { start: "07:00", end: "15:00" } },
    );
    expect(warnings).toEqual([]);
  });
});

// ── checkSameDayOverlaps ─────────────────────────────────────────────────────

describe("checkSameDayOverlaps", () => {
  it("returns empty for non-overlapping pair", () => {
    const warnings = checkSameDayOverlaps(
      [{ start: "07:00", end: "12:00" }, { start: "13:00", end: "18:00" }],
      ["Day", "Eve"],
    );
    expect(warnings).toEqual([]);
  });

  it("returns warning for overlapping pair", () => {
    const warnings = checkSameDayOverlaps(
      [{ start: "07:00", end: "16:00" }, { start: "14:00", end: "22:00" }],
      ["Day", "Eve"],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe("Day and Eve times overlap");
  });

  it("returns multiple warnings when all three overlap", () => {
    const warnings = checkSameDayOverlaps(
      [
        { start: "06:00", end: "14:00" },
        { start: "10:00", end: "18:00" },
        { start: "12:00", end: "20:00" },
      ],
      ["A", "B", "C"],
    );
    // All 3 pairs overlap: A-B, A-C, B-C
    expect(warnings).toHaveLength(3);
  });

  it("returns empty for single range", () => {
    const warnings = checkSameDayOverlaps(
      [{ start: "07:00", end: "15:00" }],
      ["Day"],
    );
    expect(warnings).toEqual([]);
  });
});

// ── resolveRequirement ───────────────────────────────────────────────────────

describe("resolveRequirement", () => {
  it("returns day-specific match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: 1, minStaff: 5 }),
    ];
    const result = resolveRequirement(reqs, 1, 10, 1);
    expect(result).toEqual({ minStaff: 5 });
  });

  it("falls back to every-day when no day-specific match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: null, minStaff: 3 }),
    ];
    const result = resolveRequirement(reqs, 1, 10, 2);
    expect(result).toEqual({ minStaff: 3 });
  });

  it("returns null when neither day-specific nor every-day match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: 1, minStaff: 5 }),
    ];
    const result = resolveRequirement(reqs, 1, 10, 3);
    expect(result).toBeNull();
  });

  it("day-specific takes precedence over every-day", () => {
    const reqs = [
      makeCoverageRequirement({ id: 1, focusAreaId: 1, shiftCodeId: 10, dayOfWeek: null, minStaff: 3 }),
      makeCoverageRequirement({ id: 2, focusAreaId: 1, shiftCodeId: 10, dayOfWeek: 1, minStaff: 7 }),
    ];
    const result = resolveRequirement(reqs, 1, 10, 1);
    expect(result).toEqual({ minStaff: 7 });
  });

  it("returns null when focusAreaId does not match", () => {
    const reqs = [
      makeCoverageRequirement({ focusAreaId: 2, shiftCodeId: 10, dayOfWeek: null, minStaff: 3 }),
    ];
    const result = resolveRequirement(reqs, 1, 10, 0);
    expect(result).toBeNull();
  });
});

// ── computeCoverageStatus ────────────────────────────────────────────────────

describe("computeCoverageStatus", () => {
  const date = new Date(2024, 0, 15);

  it("reports met when actual >= required", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    const idsForKey = () => [10];
    const result = computeCoverageStatus([emp1, emp2], date, idsForKey, new Set([10]), 10, { minStaff: 2 });
    expect(result.actual).toBe(2);
    expect(result.required).toBe(2);
    expect(result.isMet).toBe(true);
    expect(result.hasRequirement).toBe(true);
  });

  it("reports not met when actual < required", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const idsForKey = () => [10];
    const result = computeCoverageStatus([emp1], date, idsForKey, new Set([10]), 10, { minStaff: 3 });
    expect(result.actual).toBe(1);
    expect(result.required).toBe(3);
    expect(result.isMet).toBe(false);
  });

  it("reports no requirement when minStaff is 0", () => {
    const result = computeCoverageStatus([], date, () => [], new Set([10]), 10, { minStaff: 0 });
    expect(result.hasRequirement).toBe(false);
    expect(result.isMet).toBe(true);
  });

  it("returns actual 0 when no employees", () => {
    const result = computeCoverageStatus([], date, () => [10], new Set([10]), 10, { minStaff: 2 });
    expect(result.actual).toBe(0);
  });

  it("only counts employees with the matching shift code in sectionCodeIds", () => {
    const emp1 = makeEmployee({ id: "emp-1" });
    const emp2 = makeEmployee({ id: "emp-2" });
    // emp1 has shift 10, emp2 has shift 20
    const idsForKey = (empId: string) => empId === "emp-1" ? [10] : [20];
    const result = computeCoverageStatus([emp1, emp2], date, idsForKey, new Set([10, 20]), 10, { minStaff: 1 });
    expect(result.actual).toBe(1); // only emp1 on shift 10
  });
});

// ── computeCoverageGaps ──────────────────────────────────────────────────────

describe("computeCoverageGaps", () => {
  const date = new Date(2024, 0, 15); // Monday (day 1)

  it("returns empty when all requirements met", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const code = makeShiftCode({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const req = makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: null, minStaff: 1 });
    const emp = makeEmployee({ id: "emp-1", focusAreaIds: [1] });

    const gaps = computeCoverageGaps(
      [fa],
      [cat],
      [code],
      [req],
      [date],
      new Map([[1, [emp]]]),
      () => [10],
      new Map([[10, code]]),
      new Map([[1, new Set([10])]]),
    );
    expect(gaps).toEqual([]);
  });

  it("returns gap when requirement is not met", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const code = makeShiftCode({ id: 10, label: "D", categoryId: 1, focusAreaId: 1 });
    const req = makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: null, minStaff: 3 });

    const gaps = computeCoverageGaps(
      [fa],
      [cat],
      [code],
      [req],
      [date],
      new Map([[1, []]]), // no employees
      () => [],
      new Map([[10, code]]),
      new Map([[1, new Set([10])]]),
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].focusAreaId).toBe(1);
    expect(gaps[0].shiftCodeId).toBe(10);
    expect(gaps[0].status.actual).toBe(0);
    expect(gaps[0].status.required).toBe(3);
  });

  it("skips shift codes not in section", () => {
    const fa = makeFocusArea({ id: 1, name: "ICU" });
    const cat = makeShiftCategory({ id: 1, name: "Day" });
    const code = makeShiftCode({ id: 10, label: "D", categoryId: 1, focusAreaId: 2 }); // different focus area
    const req = makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 10, dayOfWeek: null, minStaff: 3 });

    const gaps = computeCoverageGaps(
      [fa],
      [cat],
      [code],
      [req],
      [date],
      new Map([[1, []]]),
      () => [],
      new Map([[10, code]]),
      new Map([[1, new Set()]]), // shift 10 NOT in focus area 1's section
    );
    expect(gaps).toEqual([]);
  });

  it("returns empty when no requirements exist", () => {
    const fa = makeFocusArea({ id: 1 });
    const cat = makeShiftCategory({ id: 1 });
    const code = makeShiftCode({ id: 10, categoryId: 1 });

    const gaps = computeCoverageGaps(
      [fa],
      [cat],
      [code],
      [], // no requirements
      [date],
      new Map([[1, []]]),
      () => [],
      new Map([[10, code]]),
      new Map([[1, new Set([10])]]),
    );
    expect(gaps).toEqual([]);
  });

  it("returns correct category name from shift category map", () => {
    const fa = makeFocusArea({ id: 1, name: "ER" });
    const cat = makeShiftCategory({ id: 2, name: "Evening" });
    const code = makeShiftCode({ id: 20, label: "E", categoryId: 2, focusAreaId: 1 });
    const req = makeCoverageRequirement({ focusAreaId: 1, shiftCodeId: 20, dayOfWeek: null, minStaff: 2 });

    const gaps = computeCoverageGaps(
      [fa],
      [cat],
      [code],
      [req],
      [date],
      new Map([[1, []]]),
      () => [],
      new Map([[20, code]]),
      new Map([[1, new Set([20])]]),
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].shiftCategoryName).toBe("Evening");
    expect(gaps[0].focusAreaName).toBe("ER");
  });
});

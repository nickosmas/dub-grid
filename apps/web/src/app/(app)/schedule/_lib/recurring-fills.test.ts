import { describe, expect, it } from "vitest";
import type { RecurringShift, ScheduleCellInput, ScheduleCellStateEntry } from "@/types";
import { planRecurringFills, type RecurringFillInput } from "./recurring-fills";

const DAY_SHIFT = 2;
const NURSE = 5;
const SICK = 7;
const worked: ScheduleCellInput = {
  kind: "worked",
  segments: [{ shiftId: DAY_SHIFT, jobId: NURSE, position: 0, isMentored: false }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
};
const absence: ScheduleCellInput = {
  ...worked,
  kind: "absence",
  segments: [],
  absenceTypeId: SICK,
};

function recurring(
  overrides: Partial<RecurringShift> & Pick<RecurringShift, "dayOfWeek">,
): RecurringShift {
  return {
    id: `r${overrides.dayOfWeek}${overrides.effectiveFrom ?? ""}`,
    empId: "ana",
    orgId: "org",
    input: worked,
    absenceTypeId: null,
    shiftLabel: "D",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

// Sun Oct 25 to Sat Oct 31, 2026; Monday is the 26th.
function fill(overrides: Partial<RecurringFillInput> = {}) {
  return planRecurringFills({
    recurringShifts: [recurring({ dayOfWeek: 1 })],
    shifts: {},
    startDate: new Date(2026, 9, 25),
    endDate: new Date(2026, 9, 31),
    activeShiftIds: new Set([DAY_SHIFT]),
    activeJobIds: new Set([NURSE]),
    activeAbsenceTypeIds: new Set([SICK]),
    ...overrides,
  });
}

const entry = (overrides: Partial<ScheduleCellStateEntry> = {}): ScheduleCellStateEntry => ({
  label: "D",
  assignmentIds: [20],
  isDraft: false,
  draftKind: null,
  publishedAssignmentDefinitionIds: [20],
  publishedLabel: "D",
  ...overrides,
});

describe("planRecurringFills", () => {
  it("fills an empty cell on the schedule's weekday", () => {
    expect(fill()).toEqual([{ employeeId: "ana", dateKey: "2026-10-26", input: worked }]);
  });

  it("never fills a cell that already has an entry, but fills a deleted one", () => {
    expect(fill({ shifts: { "ana_2026-10-26": entry() } })).toEqual([]);
    expect(fill({ shifts: { "ana_2026-10-26": entry({ isDelete: true }) } })).toHaveLength(1);
  });

  it("respects the effective dates, open ended or not", () => {
    expect(
      fill({ recurringShifts: [recurring({ dayOfWeek: 1, effectiveFrom: "2026-10-27" })] }),
    ).toEqual([]);
    expect(
      fill({ recurringShifts: [recurring({ dayOfWeek: 1, effectiveUntil: "2026-10-25" })] }),
    ).toEqual([]);
    expect(
      fill({ recurringShifts: [recurring({ dayOfWeek: 1, effectiveUntil: "2026-10-26" })] }),
    ).toHaveLength(1);
  });

  it("takes the schedule that started latest", () => {
    const later = recurring({ dayOfWeek: 1, effectiveFrom: "2026-06-01", input: absence });
    expect(fill({ recurringShifts: [recurring({ dayOfWeek: 1 }), later] })[0].input).toBe(absence);
  });

  it("fills nothing from an archived shift, job or absence type", () => {
    expect(fill({ activeShiftIds: new Set() })).toEqual([]);
    expect(fill({ activeJobIds: new Set() })).toEqual([]);
    expect(
      fill({
        recurringShifts: [recurring({ dayOfWeek: 1, input: absence })],
        activeAbsenceTypeIds: new Set(),
      }),
    ).toEqual([]);
  });

  it("fills a recurring absence", () => {
    expect(fill({ recurringShifts: [recurring({ dayOfWeek: 1, input: absence })] })[0].input).toBe(
      absence,
    );
  });

  it("fills only the people it is given", () => {
    expect(fill({ employeeIds: new Set(["ben"]) })).toEqual([]);
    expect(fill({ employeeIds: new Set(["ana"]) })).toHaveLength(1);
  });
});

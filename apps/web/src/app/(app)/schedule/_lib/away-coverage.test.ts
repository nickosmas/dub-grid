import { describe, expect, it } from "vitest";
import type { Employee, ScheduleCellStateEntry, ShiftMap } from "@/types";
import { awayRangesById, withoutAwayDays } from "./away-coverage";

function person(overrides: Partial<Employee>): Employee {
  return {
    id: "ana",
    firstName: "Ana",
    lastName: "Crawford",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [7],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

const cell = (label: string): ScheduleCellStateEntry => ({
  label,
  assignmentIds: [100],
  isDraft: false,
  draftKind: null,
  publishedAssignmentDefinitionIds: [100],
  publishedLabel: label,
});

describe("awayRangesById", () => {
  it("keeps Away people with a return date and Active people with an Away planned", () => {
    const result = awayRangesById([
      person({ id: "ana" }),
      person({ id: "ben", status: "inactive", awayUntil: "2026-11-05" }),
      person({ id: "cy", status: "inactive", awayUntil: null }),
      person({
        id: "di",
        plannedStatus: "away",
        plannedFrom: "2026-11-10",
        plannedUntil: "2027-01-04",
      }),
      person({ id: "ed", plannedStatus: "away", plannedFrom: "2026-11-10", plannedUntil: null }),
    ]);
    expect([...result]).toEqual([
      ["ben", { from: null, until: "2026-11-05" }],
      ["di", { from: "2026-11-10", until: "2027-01-04" }],
      ["ed", { from: "2026-11-10", until: null }],
    ]);
  });
});

describe("withoutAwayDays", () => {
  it("drops an Away person's days before their return date and keeps the rest", () => {
    const shifts: ShiftMap = {
      "ben_2026-11-04": cell("D"),
      "ben_2026-11-05": cell("E"),
      "ana_2026-11-04": cell("D"),
    };
    expect(
      withoutAwayDays(shifts, new Map([["ben", { from: null, until: "2026-11-05" }]])),
    ).toEqual({
      "ben_2026-11-05": shifts["ben_2026-11-05"],
      "ana_2026-11-04": shifts["ana_2026-11-04"],
    });
  });

  it("returns the same map when nobody is away until a date", () => {
    const shifts: ShiftMap = { "ana_2026-11-04": cell("D") };
    expect(withoutAwayDays(shifts, new Map())).toBe(shifts);
  });
});

describe("withoutAwayDays with a planned away", () => {
  it("drops only the days from the start up to the return date", () => {
    const shifts: ShiftMap = {
      "di_2026-11-09": cell("D"),
      "di_2026-11-10": cell("D"),
      "di_2027-01-04": cell("D"),
    };
    expect(
      withoutAwayDays(shifts, new Map([["di", { from: "2026-11-10", until: "2027-01-04" }]])),
    ).toEqual({
      "di_2026-11-09": shifts["di_2026-11-09"],
      "di_2027-01-04": shifts["di_2027-01-04"],
    });
  });
});

import { describe, expect, it } from "vitest";
import type { Employee, ScheduleCellStateEntry, ShiftMap } from "@/types";
import { awayUntilById, withoutAwayDays } from "./away-coverage";

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

describe("awayUntilById", () => {
  it("keeps only Away people with a return date", () => {
    const result = awayUntilById([
      person({ id: "ana" }),
      person({ id: "ben", status: "inactive", awayUntil: "2026-11-05" }),
      person({ id: "cy", status: "inactive", awayUntil: null }),
    ]);
    expect([...result]).toEqual([["ben", "2026-11-05"]]);
  });
});

describe("withoutAwayDays", () => {
  it("drops an Away person's days before their return date and keeps the rest", () => {
    const shifts: ShiftMap = {
      "ben_2026-11-04": cell("D"),
      "ben_2026-11-05": cell("E"),
      "ana_2026-11-04": cell("D"),
    };
    expect(withoutAwayDays(shifts, new Map([["ben", "2026-11-05"]]))).toEqual({
      "ben_2026-11-05": shifts["ben_2026-11-05"],
      "ana_2026-11-04": shifts["ana_2026-11-04"],
    });
  });

  it("returns the same map when nobody is away until a date", () => {
    const shifts: ShiftMap = { "ana_2026-11-04": cell("D") };
    expect(withoutAwayDays(shifts, new Map())).toBe(shifts);
  });
});

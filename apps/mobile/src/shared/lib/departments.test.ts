import { describe, expect, it } from "vitest";
import { getDepartmentNames, getScheduledDepartmentNames } from "./departments";

const departments = [
  { id: 4, name: "North Wing", abbr: "NW", type: "scheduled" as const },
  { id: 5, name: "South Wing", abbr: "SW", type: "scheduled" as const },
  { id: 10, name: "Clinical Leadership", abbr: "CL", type: "management" as const },
];

const focusAreas = [
  { id: 1, name: "Skilled Nursing", departmentId: 4 },
  { id: 2, name: "Memory Care", departmentId: 4 },
  { id: 3, name: "Rehab", departmentId: 5 },
  { id: 4, name: "Floating", departmentId: null },
];

describe("getDepartmentNames", () => {
  it("keeps the order it was given and drops ids the org no longer has", () => {
    expect(getDepartmentNames([10, 999, 4], departments)).toEqual([
      "Clinical Leadership",
      "North Wing",
    ]);
  });

  it("returns nothing when the department list hasn't loaded", () => {
    expect(getDepartmentNames([4], undefined)).toEqual([]);
  });
});

describe("getScheduledDepartmentNames", () => {
  it("names each department once, however many focus areas share it", () => {
    expect(getScheduledDepartmentNames([1, 2, 3], focusAreas, departments)).toEqual([
      "North Wing",
      "South Wing",
    ]);
  });

  it("ignores a focus area that belongs to no department", () => {
    expect(getScheduledDepartmentNames([4], focusAreas, departments)).toEqual([]);
  });

  it("is empty for someone with no focus areas — a management-only person", () => {
    expect(getScheduledDepartmentNames([], focusAreas, departments)).toEqual([]);
  });
});

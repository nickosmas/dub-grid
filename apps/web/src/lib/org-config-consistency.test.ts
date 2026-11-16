import { describe, expect, it } from "vitest";
import { findOrgConfigGaps } from "./org-config-consistency";

const staff = (focusAreaIds: number[] = [1], status = "active") => ({
  status: status as "active",
  focusAreaIds,
  archivedAt: null,
});
const area = (id: number, departmentId: number | null) => ({ id, departmentId, archivedAt: null });
const dept = (id: number, type: "scheduled" | "management" = "scheduled") => ({
  id,
  type,
  archivedAt: null,
});

describe("findOrgConfigGaps", () => {
  it("finds nothing wrong with consistent settings", () => {
    const report = findOrgConfigGaps({
      employees: [staff()],
      focusAreas: [area(1, 10)],
      departments: [dept(10)],
      assignments: [{ id: 100 }],
      referencedAssignmentIds: [100],
    });
    expect(report.gaps).toEqual([]);
  });

  it("finds nothing wrong for a new organization with no staff", () => {
    const report = findOrgConfigGaps({
      employees: [],
      focusAreas: [],
      departments: [],
      assignments: [],
    });
    expect(report.gaps).toEqual([]);
  });

  it("flags staff with focus areas when no area belongs to a scheduled department", () => {
    expect(
      findOrgConfigGaps({
        employees: [staff()],
        focusAreas: [area(1, 10)],
        departments: [],
        assignments: [{ id: 100 }],
      }).gaps,
    ).toEqual(["no-scheduled-sections"]);
    expect(
      findOrgConfigGaps({
        employees: [staff()],
        focusAreas: [area(1, 10)],
        departments: [dept(10, "management")],
        assignments: [{ id: 100 }],
      }).gaps,
    ).toEqual(["no-scheduled-sections"]);
  });

  it("ignores staff who are not active or not placed in an area", () => {
    expect(
      findOrgConfigGaps({
        employees: [staff([1], "inactive"), staff([])],
        focusAreas: [],
        departments: [],
        assignments: [],
      }).gaps,
    ).toEqual([]);
  });

  it("flags cells that point at shift codes when the settings have none", () => {
    const report = findOrgConfigGaps({
      employees: [staff()],
      focusAreas: [area(1, 10)],
      departments: [dept(10)],
      assignments: [],
      referencedAssignmentIds: [100, 100, 101],
    });
    expect(report.gaps).toEqual(["no-shift-codes"]);
    expect(report.counts.referencedShiftCodes).toBe(2);
  });

  it("flags cells whose shift codes the settings don't know", () => {
    const report = findOrgConfigGaps({
      employees: [staff()],
      focusAreas: [area(1, 10)],
      departments: [dept(10)],
      assignments: [{ id: 100 }],
      referencedAssignmentIds: [100, 200, 201],
    });
    expect(report.gaps).toEqual(["unknown-shift-codes"]);
    expect(report.counts.unknownShiftCodes).toBe(2);
  });

  it("lets a retired code or two through, as ordinary history", () => {
    const report = findOrgConfigGaps({
      employees: [staff()],
      focusAreas: [area(1, 10)],
      departments: [dept(10)],
      assignments: [{ id: 100 }, { id: 101 }],
      referencedAssignmentIds: [100, 101, 300],
    });
    expect(report.gaps).toEqual([]);
    expect(report.counts.unknownShiftCodes).toBe(1);
  });

  it("flags a page with no staff when the server counted some", () => {
    const report = findOrgConfigGaps({
      employees: [],
      focusAreas: [area(1, 10)],
      departments: [dept(10)],
      assignments: [{ id: 100 }],
      serverActiveStaffCount: 37,
    });
    expect(report.gaps).toEqual(["no-staff-loaded"]);
    expect(
      findOrgConfigGaps({
        employees: [],
        focusAreas: [],
        departments: [],
        assignments: [],
        serverActiveStaffCount: 0,
      }).gaps,
    ).toEqual([]);
  });

  it("reports counts only", () => {
    const { counts } = findOrgConfigGaps({
      employees: [staff(), staff([])],
      focusAreas: [area(1, 10), area(2, null)],
      departments: [dept(10)],
      assignments: [{ id: 100 }],
      referencedAssignmentIds: [100],
    });
    expect(counts).toEqual({
      serverActiveStaff: null,
      activeStaff: 2,
      staffWithAreas: 1,
      focusAreas: 2,
      scheduledDepartments: 1,
      placedFocusAreas: 1,
      shiftCodes: 1,
      referencedShiftCodes: 1,
      unknownShiftCodes: 0,
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { planImportPrevious } from "./operations";
import type { Employee, ScheduleCellInput, ShiftMap } from "@/types";

function buildEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Taylor",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [11],
    phone: "",
    email: "",
    contactNotes: "",
    deptAdminIds: [],
    userId: null,
    departmentIds: [],
    version: 0,
    employeeNumber: 1001,
    createdAt: null,
    ...overrides,
  };
}

function buildShift(
  overrides: Partial<ShiftMap[string]> = {},
): ShiftMap[string] {
  return {
    label: "Day",
    assignmentIds: [1],
    isDraft: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: [1],
    publishedLabel: "Day",
    ...overrides,
  };
}

const buildEntryPayload = (entry: ShiftMap[string]): ScheduleCellInput => ({
  kind: entry.absenceTypeId != null ? "absence" : "worked",
  segments: (entry.segments ?? []).map((s, i) => ({
    shiftId: s.shiftId,
    jobId: s.jobId,
    position: s.position ?? i,
    isMentored: s.isMentored ?? false,
  })),
  absenceTypeId: entry.absenceTypeId ?? null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

/**
 * `weekStart` is 2026-05-17 (Sunday). `sourceStart` is 14 days earlier
 * (2026-05-03). Days[0] is the first day of each period.
 */
const sourceStart = new Date(2026, 4, 3); // May 3 2026 local
const weekStart = new Date(2026, 4, 17); // May 17 2026 local
const days = 14;

describe("planImportPrevious", () => {
  it("plans inserts for every qualified source shift when target cells are empty", () => {
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({ label: "Day" }),
      "emp-1_2026-05-04": buildShift({ label: "Night", assignmentIds: [2] }),
    };
    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification: () => null, // always qualified
      buildEntryPayload,
      currentUserId: "user-1",
    });

    expect(result.upsertItems).toHaveLength(2);
    expect(result.upsertItems.map((it) => it.date)).toEqual([
      "2026-05-17",
      "2026-05-18",
    ]);
    expect(Object.keys(result.shiftUpdates)).toEqual([
      "emp-1_2026-05-17",
      "emp-1_2026-05-18",
    ]);
    expect(result.shiftUpdates["emp-1_2026-05-17"]).toMatchObject({
      label: "Day",
      assignmentIds: [1],
      isDraft: true,
      draftKind: "new",
      updatedBy: "user-1",
    });
    expect(result.disqualified).toEqual([]);
  });

  it("collects disqualified shifts and excludes them from upserts", () => {
    const emp = buildEmployee({ firstName: "Sam", lastName: "Doe" });
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({ assignmentIds: [99] }), // disqualified
      "emp-1_2026-05-04": buildShift({ assignmentIds: [1] }), // qualified
    };
    const checkQualification = vi.fn((_empId: string, ids: number[]) =>
      ids.includes(99) ? "Missing cert" : null,
    );

    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification,
      buildEntryPayload,
      currentUserId: null,
    });

    expect(result.upsertItems).toHaveLength(1);
    expect(result.upsertItems[0]?.date).toBe("2026-05-18");
    expect(result.disqualified).toEqual([
      { empName: "Sam Doe", date: "5/17", reason: "Missing cert" },
    ]);
  });

  it("skips source cells where the target already has data", () => {
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift(), // source
      "emp-1_2026-05-17": buildShift({ label: "Existing" }), // target occupied
    };
    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification: () => null,
      buildEntryPayload,
      currentUserId: null,
    });

    expect(result.upsertItems).toHaveLength(0);
    expect(result.disqualified).toEqual([]);
  });

  it("skips source cells with no work and no absence", () => {
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({
        assignmentIds: [],
        absenceTypeId: null,
      }),
    };
    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification: () => null,
      buildEntryPayload,
      currentUserId: null,
    });

    expect(result.upsertItems).toHaveLength(0);
  });

  it("skips source cells flagged for deletion", () => {
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({ isDelete: true }),
    };
    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification: () => null,
      buildEntryPayload,
      currentUserId: null,
    });

    expect(result.upsertItems).toHaveLength(0);
  });

  it("imports absence-only source cells without running qualification check", () => {
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({
        assignmentIds: [],
        absenceTypeId: 5,
        publishedAssignmentDefinitionIds: [],
      }),
    };
    const checkQualification = vi.fn(() => "should not be called");

    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification,
      buildEntryPayload,
      currentUserId: null,
    });

    expect(checkQualification).not.toHaveBeenCalled();
    expect(result.upsertItems).toHaveLength(1);
    expect(result.upsertItems[0]?.input.kind).toBe("absence");
  });

  it("reproduces the bug: preview overcount when qualification filter runs only at execute time", () => {
    // 3 source shifts; 1 employee no longer qualified for assignment 99.
    // Buggy preview count would be 3; correct count is 2.
    const emp = buildEmployee();
    const shifts: ShiftMap = {
      "emp-1_2026-05-03": buildShift({ assignmentIds: [1] }),
      "emp-1_2026-05-04": buildShift({ assignmentIds: [99] }),
      "emp-1_2026-05-05": buildShift({ assignmentIds: [1] }),
    };
    const result = planImportPrevious({
      days,
      sourceStart,
      weekStart,
      employees: [emp],
      shifts,
      checkQualification: (_e, ids) => (ids.includes(99) ? "no cert" : null),
      buildEntryPayload,
      currentUserId: null,
    });

    expect(result.upsertItems).toHaveLength(2);
    expect(result.disqualified).toHaveLength(1);
    expect(result.upsertItems.length + result.disqualified.length).toBe(3);
  });
});

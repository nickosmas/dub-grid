import { describe, expect, it } from "vitest";
import type { AssignmentDefinition, GridOpenShift, JobDefinition, ShiftCategory } from "@/types";
import type { Employee } from "@dubgrid/domain";
import {
  buildOpenShiftStaffingCandidates,
  buildStaffedOpenShiftInput,
  isCalloffOpenShiftStaffedByDraft,
  resolveOpenShiftClickAction,
  type StaffingScheduleState,
} from "./open-shift-staffing";

const shifts: ShiftCategory[] = [
  { id: 1, orgId: "org", name: "Day", startTime: "07:00", endTime: "15:00", sortOrder: 0 },
  { id: 2, orgId: "org", name: "Evening", startTime: "15:00", endTime: "23:00", sortOrder: 1 },
];
const jobs: JobDefinition[] = [
  {
    id: 10,
    orgId: "org",
    name: "Nurse",
    abbr: "N",
    focusAreaId: 7,
    eligibleRoleIds: [3],
    requiredCertificationIds: [4],
    eligibilityMode: "and",
    showOnGrid: true,
    color: "#fff",
    border: "#ddd",
    text: "#111",
    sortOrder: 0,
  },
  {
    id: 11,
    orgId: "org",
    name: "Support",
    abbr: "S",
    focusAreaId: 7,
    eligibleRoleIds: [3],
    requiredCertificationIds: [4],
    eligibilityMode: "or",
    showOnGrid: true,
    color: "#fff",
    border: "#ddd",
    text: "#111",
    sortOrder: 1,
  },
];
const assignments: AssignmentDefinition[] = [
  {
    id: 100,
    orgId: "org",
    label: "D Nurse",
    name: "Day Nurse",
    color: "#fff",
    border: "#ddd",
    text: "#111",
    shiftId: 1,
    categoryId: 1,
    jobId: 10,
    focusAreaId: 7,
    sortOrder: 0,
  },
  {
    id: 101,
    orgId: "org",
    label: "E Support",
    name: "Evening Support",
    color: "#fff",
    border: "#ddd",
    text: "#111",
    shiftId: 2,
    categoryId: 2,
    jobId: 11,
    focusAreaId: 7,
    sortOrder: 1,
  },
];

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "employee-1",
    firstName: "Ada",
    lastName: "Lovelace",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 4,
    roleIds: [3],
    seniority: 1,
    focusAreaIds: [7],
    phone: "",
    email: "ada@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [1],
    deptAdminIds: [],
    version: 1,
    ...overrides,
  };
}

function gap(overrides: Partial<GridOpenShift> = {}): GridOpenShift {
  return {
    id: "gap",
    source: "coverage_gap",
    date: "2026-09-14",
    focusAreaId: 7,
    assignmentIds: [100],
    eligibleAssignmentDefinitionIds: [100, 101],
    assignmentLabel: "Open",
    customStartTime: null,
    customEndTime: null,
    ...overrides,
  };
}

const baseContext = { assignments, shiftCategories: shifts, jobs };

describe("buildOpenShiftStaffingCandidates", () => {
  it("keeps active qualified staff and returns every assignment option they can cover", () => {
    const candidates = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap(),
      employees: [employee()],
      scheduleByEmployeeId: new Map(),
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].options.map((option) => option.assignmentIds)).toEqual([[100], [101]]);
  });

  it("excludes inactive, wrong-area, and AND-rule role or certification mismatches", () => {
    const employees = [
      employee({ id: "inactive", status: "inactive" }),
      employee({ id: "wrong-area", focusAreaIds: [8] }),
      employee({ id: "wrong-role", roleIds: [] }),
      employee({ id: "wrong-cert", certificationId: null }),
    ];
    expect(
      buildOpenShiftStaffingCandidates({
        ...baseContext,
        openShift: gap({ eligibleAssignmentDefinitionIds: [100] }),
        employees,
        scheduleByEmployeeId: new Map(),
      }),
    ).toEqual([]);
  });

  it("honors OR eligibility when either the role or certification matches", () => {
    const candidates = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap({ eligibleAssignmentDefinitionIds: [101] }),
      employees: [
        employee({ id: "role", certificationId: null }),
        employee({ id: "cert", roleIds: [] }),
        employee({ id: "neither", roleIds: [], certificationId: null }),
      ],
      scheduleByEmployeeId: new Map(),
    });
    expect(candidates.map((candidate) => candidate.employee.id)).toEqual(["role", "cert"]);
  });

  it("includes absences and adjacent same-day shifts but excludes overlapping work", () => {
    const worked = (assignmentId: number): StaffingScheduleState => ({
      kind: "worked",
      segments: [
        {
          shiftId: assignmentId === 100 ? 1 : 2,
          jobId: assignmentId === 100 ? 10 : 11,
          position: 0,
          isMentored: false,
        },
      ],
      assignmentIds: [assignmentId],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
    });
    const schedule = new Map<string, StaffingScheduleState | null>([
      [
        "absence",
        { ...worked(100), kind: "absence", segments: [], assignmentIds: [], absenceTypeId: 9 },
      ],
      ["overlap", worked(100)],
      ["adjacent", worked(101)],
    ]);
    const candidates = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap({ eligibleAssignmentDefinitionIds: [100] }),
      employees: [
        employee({ id: "absence" }),
        employee({ id: "overlap" }),
        employee({ id: "adjacent" }),
      ],
      scheduleByEmployeeId: schedule,
    });
    expect(candidates.map((candidate) => candidate.employee.id)).toEqual(["absence", "adjacent"]);
    expect(candidates[0].existingState?.absenceTypeId).toBe(9);
    expect(candidates[1].existingAssignments).toEqual([
      { assignmentId: 101, timeRange: { start: "15:00", end: "23:00" } },
    ]);
  });

  it("excludes previous-day and next-day overnight overlaps", () => {
    const state = (assignmentId: number, start: string, end: string): StaffingScheduleState => ({
      kind: "worked",
      segments: [{ shiftId: 1, jobId: 10, position: 0, isMentored: false }],
      assignmentIds: [assignmentId],
      absenceTypeId: null,
      customStartTime: start,
      customEndTime: end,
    });
    const employees = [employee({ id: "conflict" }), employee({ id: "available" })];

    const afterPreviousOvernight = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap({ eligibleAssignmentDefinitionIds: [100] }),
      employees,
      scheduleByEmployeeId: new Map(),
      adjacentScheduleByEmployeeId: new Map([
        ["conflict", { previous: state(101, "23:00", "08:00"), next: null }],
      ]),
    });
    expect(afterPreviousOvernight.map((candidate) => candidate.employee.id)).toEqual(["available"]);

    const beforeNextDayWork = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap({
        source: "calloff",
        assignmentIds: [100],
        eligibleAssignmentDefinitionIds: undefined,
        customStartTime: "22:00",
        customEndTime: "08:00",
      }),
      employees,
      scheduleByEmployeeId: new Map(),
      adjacentScheduleByEmployeeId: new Map([
        ["conflict", { previous: null, next: state(100, "07:00", "15:00") }],
      ]),
    });
    expect(beforeNextDayWork.map((candidate) => candidate.employee.id)).toEqual(["available"]);
  });

  // The adjacent-day schedules are read from the loaded shift window, so a
  // neighbouring day outside it looks identical to a day with no shift. The
  // builder must not let that pass as "no conflict" without saying so.
  it("flags every candidate when a neighbouring day is outside the loaded window", () => {
    const employees = [employee({ id: "a" }), employee({ id: "b" })];
    const input = {
      ...baseContext,
      openShift: gap({ eligibleAssignmentDefinitionIds: [100] }),
      employees,
      scheduleByEmployeeId: new Map(),
      adjacentScheduleByEmployeeId: new Map(),
    };

    const loaded = buildOpenShiftStaffingCandidates({
      ...input,
      adjacentDaysLoaded: { previous: true, next: true },
    });
    expect(loaded.map((candidate) => candidate.adjacentCheckUnverified)).toEqual([false, false]);

    const omitted = buildOpenShiftStaffingCandidates(input);
    expect(omitted.map((candidate) => candidate.adjacentCheckUnverified)).toEqual([false, false]);

    const previousMissing = buildOpenShiftStaffingCandidates({
      ...input,
      adjacentDaysLoaded: { previous: false, next: true },
    });
    expect(previousMissing.map((candidate) => candidate.employee.id)).toEqual(["a", "b"]);
    expect(previousMissing.map((candidate) => candidate.adjacentCheckUnverified)).toEqual([
      true,
      true,
    ]);

    const nextMissing = buildOpenShiftStaffingCandidates({
      ...input,
      adjacentDaysLoaded: { previous: true, next: false },
    });
    expect(nextMissing.every((candidate) => candidate.adjacentCheckUnverified)).toBe(true);
  });

  it("requires every exact calloff segment to be qualified and conflict-free", () => {
    const candidates = buildOpenShiftStaffingCandidates({
      ...baseContext,
      openShift: gap({
        source: "calloff",
        assignmentIds: [100, 101],
        eligibleAssignmentDefinitionIds: undefined,
      }),
      employees: [
        employee({ id: "qualified" }),
        employee({ id: "role-only", certificationId: null }),
      ],
      scheduleByEmployeeId: new Map(),
    });
    expect(candidates.map((candidate) => candidate.employee.id)).toEqual(["qualified"]);
    expect(candidates[0].options[0].assignmentIds).toEqual([100, 101]);
  });
});

describe("resolveOpenShiftClickAction", () => {
  it("routes editors to staffing while preserving volunteer and read-only paths", () => {
    expect(
      resolveOpenShiftClickAction({
        canEditShifts: true,
        canSeeAllOpenShifts: true,
        canVolunteer: true,
        viewerEligible: true,
      }),
    ).toBe("staff");
    expect(
      resolveOpenShiftClickAction({
        canEditShifts: false,
        canSeeAllOpenShifts: false,
        canVolunteer: true,
        viewerEligible: true,
      }),
    ).toBe("volunteer");
    expect(
      resolveOpenShiftClickAction({
        canEditShifts: false,
        canSeeAllOpenShifts: true,
        canVolunteer: false,
        viewerEligible: false,
      }),
    ).toBe("details");
  });
});

describe("buildStaffedOpenShiftInput", () => {
  it("preserves an existing segment and its aligned time while appending the selected option", () => {
    const existingState: StaffingScheduleState = {
      kind: "worked",
      segments: [{ shiftId: 2, jobId: 11, position: 0, isMentored: true }],
      assignmentIds: [101],
      absenceTypeId: null,
      customStartTime: "16:00",
      customEndTime: "22:00",
      seriesId: "series-1",
      fromRecurring: true,
    };
    expect(
      buildStaffedOpenShiftInput({
        ...baseContext,
        existingState,
        option: {
          assignmentIds: [100],
          alignedTimeRanges: [{ start: "07:00", end: "15:00" }],
          timeRanges: [{ start: "07:00", end: "15:00" }],
        },
      }),
    ).toEqual({
      kind: "worked",
      segments: [
        { shiftId: 2, jobId: 11, position: 0, isMentored: true },
        { shiftId: 1, jobId: 10, position: 1, isMentored: false },
      ],
      absenceTypeId: null,
      customStartTime: "16:00|07:00",
      customEndTime: "22:00|15:00",
      seriesId: "series-1",
      fromRecurring: true,
    });
  });

  it("replaces an absence with staffed work but refuses an unresolved assignment", () => {
    const absence: StaffingScheduleState = {
      kind: "absence",
      segments: [],
      assignmentIds: [],
      absenceTypeId: 9,
      customStartTime: null,
      customEndTime: null,
    };
    expect(
      buildStaffedOpenShiftInput({
        ...baseContext,
        existingState: absence,
        option: { assignmentIds: [100], alignedTimeRanges: [null], timeRanges: [] },
      }),
    ).toEqual({
      kind: "worked",
      segments: [{ shiftId: 1, jobId: 10, position: 0, isMentored: false }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    });
    expect(
      buildStaffedOpenShiftInput({
        ...baseContext,
        existingState: null,
        option: { assignmentIds: [999], alignedTimeRanges: [null], timeRanges: [] },
      }),
    ).toBeNull();
  });
});

describe("isCalloffOpenShiftStaffedByDraft", () => {
  it("matches only assignment ids newly added by a draft in the required area and date", () => {
    const openShift = gap({
      source: "calloff",
      assignmentIds: [100],
      eligibleAssignmentDefinitionIds: undefined,
    });
    const matchingEntry = {
      label: "D Nurse",
      assignmentIds: [101, 100],
      isDraft: true,
      draftKind: "modified" as const,
      publishedAssignmentDefinitionIds: [101],
      publishedLabel: "E Support",
      effective: {
        kind: "worked" as const,
        segments: [
          { shiftId: 2, jobId: 11, label: "E Support", position: 0, assignmentId: 101 },
          { shiftId: 1, jobId: 10, label: "D Nurse", position: 1, assignmentId: 100 },
        ],
        assignmentIds: [101, 100],
        label: "E Support / D Nurse",
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      },
    };
    expect(
      isCalloffOpenShiftStaffedByDraft({
        openShift,
        employees: [employee()],
        shifts: { "employee-1_2026-09-14": matchingEntry },
      }),
    ).toBe(true);
    expect(
      isCalloffOpenShiftStaffedByDraft({
        openShift,
        employees: [employee({ focusAreaIds: [8] })],
        shifts: { "employee-1_2026-09-14": matchingEntry },
      }),
    ).toBe(false);
    expect(
      isCalloffOpenShiftStaffedByDraft({
        openShift,
        employees: [employee()],
        shifts: { "employee-1_2026-09-15": matchingEntry },
      }),
    ).toBe(false);
  });

  it("does not mistake an already-published matching assignment for new staffing", () => {
    const openShift = gap({
      source: "calloff",
      assignmentIds: [100],
      eligibleAssignmentDefinitionIds: undefined,
    });
    expect(
      isCalloffOpenShiftStaffedByDraft({
        openShift,
        employees: [employee()],
        shifts: {
          "employee-1_2026-09-14": {
            label: "D Nurse",
            assignmentIds: [100],
            isDraft: false,
            draftKind: null,
            publishedAssignmentDefinitionIds: [100],
            publishedLabel: "D Nurse",
          },
        },
      }),
    ).toBe(false);
  });
});

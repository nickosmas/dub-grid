import { describe, expect, it } from "vitest";
import { buildGridCalloffOpenShiftsFromRequests } from "./open-shifts";
import type { Employee, ShiftRequest } from "@/types";

function buildEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Taylor",
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
    ...overrides,
  };
}

function buildShiftRequest(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: "request-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "emp-1",
    requesterName: "Alex Taylor",
    requesterShiftDate: "2026-04-21",
    requesterState: {
      kind: "worked",
      segments: [{ shiftId: 5, jobId: 8, position: 0 }],
      absenceTypeId: null,
      customStartTime: "07:00:00",
      customEndTime: "15:00:00",
      seriesId: null,
      fromRecurring: false,
    },
    requesterPresentation: null,
    requesterShiftIds: [5],
    requesterJobIds: [8],
    requesterSegments: [
      {
        shiftId: 5,
        jobId: 8,
        label: "D",
        shiftName: "Day Shift",
        jobName: "Nurse",
        startTime: "07:00:00",
        endTime: "15:00:00",
      },
    ],
    requesterAssignmentDefinitionIds: [21],
    requesterShiftLabel: "Day Shift",
    requesterFocusAreaId: 11,
    requesterCustomStartTime: "07:00:00",
    requesterCustomEndTime: "15:00:00",
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetState: null,
    targetPresentation: null,
    targetShiftIds: null,
    targetJobIds: null,
    targetSegments: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: "calloff-1",
    adminUserId: null,
    adminNote: null,
    expiresAt: "2026-04-21T23:59:59.000Z",
    resolvedAt: null,
    createdAt: "2026-04-20T12:00:00.000Z",
    updatedAt: "2026-04-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildGridCalloffOpenShiftsFromRequests", () => {
  it("maps open pickup requests spawned from calloffs into grid open shifts", () => {
    const openShiftRequests = [
      buildShiftRequest(),
      buildShiftRequest({
        id: "request-swap",
        type: "swap",
      }),
      buildShiftRequest({
        id: "request-no-parent",
        parentRequestId: null,
      }),
      buildShiftRequest({
        id: "request-outside-range",
        requesterShiftDate: "2026-05-01",
      }),
    ];

    const result = buildGridCalloffOpenShiftsFromRequests({
      requests: openShiftRequests,
      employees: [buildEmployee()],
      startDate: "2026-04-20",
      endDate: "2026-04-27",
    });

    expect(result).toEqual([
      {
        id: "request-1",
        source: "calloff",
        date: "2026-04-21",
        focusAreaId: 11,
        shiftIds: [5],
        jobIds: [8],
        segments: [
          {
            shiftId: 5,
            jobId: 8,
            label: "D",
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
          },
        ],
        assignmentIds: [21],
        assignmentLabel: "Day Shift",
        customStartTime: "07:00:00",
        customEndTime: "15:00:00",
        calledOffBy: "Alex Taylor",
        requestId: "request-1",
        needed: 1,
      },
    ]);
  });

  it("falls back to the requester's home focus area and skips requests with no focus area", () => {
    const result = buildGridCalloffOpenShiftsFromRequests({
      requests: [
        buildShiftRequest({
          id: "request-fallback",
          requesterFocusAreaId: null,
        }),
        buildShiftRequest({
          id: "request-missing-focus-area",
          requesterEmpId: "emp-2",
          requesterFocusAreaId: null,
        }),
      ],
      employees: [buildEmployee()],
      startDate: "2026-04-20",
      endDate: "2026-04-27",
    });

    expect(result.map((item) => ({ id: item.id, focusAreaId: item.focusAreaId }))).toEqual([
      { id: "request-fallback", focusAreaId: 11 },
    ]);
  });
});

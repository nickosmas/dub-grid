import { describe, expect, it } from "vitest";
import {
  buildGridCalloffOpenShiftsFromRequests,
  countPendingVolunteerRequestsForCoverageGap,
  hasPendingVolunteerRequestForCoverageGap,
  selectVisibleCoverageGaps,
} from "./open-shifts";
import type { CoverageGap, Employee, ShiftRequest } from "@/types";

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

function buildCoverageGap(overrides: Partial<CoverageGap> = {}): CoverageGap {
  return {
    focusAreaId: 11,
    focusAreaName: "ICU",
    requirementAssignmentDefinitionId: 21,
    assignmentId: 21,
    ruleLabel: "Day Shift",
    assignmentLabel: "Day Shift",
    eligibleAssignmentDefinitionIds: [21],
    preferredOpenAssignmentDefinitionId: 21,
    shiftCategoryId: 5,
    shiftCategoryName: "Days",
    date: new Date("2026-04-21T00:00:00"),
    status: {
      actual: 0,
      required: 1,
      isMet: false,
      hasRequirement: true,
    },
    shortageDetails: [],
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

  it("shows all current coverage gaps to schedule editors, even before publication", () => {
    const unpublishedGap = buildCoverageGap({
      date: new Date("2026-04-22T00:00:00.000Z"),
    });
    const publishedGap = buildCoverageGap();

    expect(
      selectVisibleCoverageGaps({
        allCoverageGaps: [publishedGap, unpublishedGap],
        publishedCoverageGaps: [publishedGap],
        canEditShifts: true,
      }),
    ).toEqual([publishedGap, unpublishedGap]);

    expect(
      selectVisibleCoverageGaps({
        allCoverageGaps: [publishedGap, unpublishedGap],
        publishedCoverageGaps: [publishedGap],
        canEditShifts: false,
      }),
    ).toEqual([publishedGap]);
  });

  it("counts pending volunteer requests as individual coverage-gap slots", () => {
    const gap = buildCoverageGap({
      status: {
        actual: 0,
        required: 3,
        isMet: false,
        hasRequirement: true,
      },
    });
    const pendingVolunteer = buildShiftRequest({
      id: "pending-volunteer",
      status: "pending_approval",
      parentRequestId: null,
    });

    const count = countPendingVolunteerRequestsForCoverageGap({
      gap,
      requests: [
        pendingVolunteer,
        buildShiftRequest({
          id: "duplicate-segment-request",
          status: "pending_approval",
          parentRequestId: null,
          requesterAssignmentDefinitionIds: [21, 21],
        }),
        buildShiftRequest({
          id: "different-focus-area",
          status: "pending_approval",
          parentRequestId: null,
          requesterFocusAreaId: 99,
        }),
        buildShiftRequest({
          id: "calloff-open-request",
          status: "open",
          parentRequestId: "calloff-1",
        }),
      ],
    });

    expect(gap.status.required - gap.status.actual - count).toBe(1);
  });

  it("ignores pending volunteer requests that do not match the coverage focus area", () => {
    const gap = buildCoverageGap({
      status: {
        actual: 0,
        required: 2,
        isMet: false,
        hasRequirement: true,
      },
    });

    expect(
      countPendingVolunteerRequestsForCoverageGap({
        gap,
        requests: [
          buildShiftRequest({
            id: "missing-focus",
            status: "pending_approval",
            parentRequestId: null,
            requesterFocusAreaId: null,
          }),
          buildShiftRequest({
            id: "different-focus",
            status: "pending_approval",
            parentRequestId: null,
            requesterFocusAreaId: 99,
          }),
        ],
      }),
    ).toBe(0);
  });

  it("detects when the current employee already volunteered for a coverage gap", () => {
    const gap = buildCoverageGap({
      status: {
        actual: 0,
        required: 2,
        isMet: false,
        hasRequirement: true,
      },
    });
    const requests = [
      buildShiftRequest({
        id: "pending-volunteer",
        status: "pending_approval",
        parentRequestId: null,
        requesterEmpId: "emp-1",
      }),
    ];

    expect(
      hasPendingVolunteerRequestForCoverageGap({
        employeeId: "emp-1",
        gap,
        requests,
      }),
    ).toBe(true);
    expect(
      hasPendingVolunteerRequestForCoverageGap({
        employeeId: "emp-2",
        gap,
        requests,
      }),
    ).toBe(false);
  });

  it("does not treat a pending volunteer request without a focus area as the employee's focused gap", () => {
    const gap = buildCoverageGap();

    expect(
      hasPendingVolunteerRequestForCoverageGap({
        employeeId: "emp-1",
        gap,
        requests: [
          buildShiftRequest({
            id: "missing-focus",
            status: "pending_approval",
            parentRequestId: null,
            requesterEmpId: "emp-1",
            requesterFocusAreaId: null,
          }),
        ],
      }),
    ).toBe(false);
  });
});

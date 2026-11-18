import type {
  MobileDashboardResponse,
  MobileOpenShift,
  MobileScheduleEntry,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import {
  buildDayCoverage,
  buildDayOpenShifts,
  buildDayRequests,
  findViewerDay,
} from "./day-overview";

const DATE = "2026-11-19";

const segment = {
  shiftId: 1,
  jobId: 2,
  shiftName: "Day Shift",
  jobName: "RN",
  shiftStartTime: "07:00:00",
  shiftEndTime: "15:00:00",
  startTime: "07:00:00",
  endTime: "15:00:00",
  focusAreaId: 3,
  displayFocusAreaName: "3 East",
};

const presentation = {
  label: "D",
  shiftName: "Day Shift",
  focusAreaId: 3,
  focusAreaName: "3 East",
  displayFocusAreaName: "3 East",
  startTime: "07:00:00",
  endTime: "15:00:00",
  segments: [segment],
};

const workedState = {
  kind: "worked",
  segments: [{ shiftId: 1, jobId: 2, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
};

describe("buildDayCoverage", () => {
  const section = (
    name: string,
    daily: Array<{ dateKey: string; filledCount: number; requiredCount: number; status: string }>,
  ) =>
    ({
      focusAreaId: name.length,
      focusAreaName: name,
      requiredTotal: 0,
      filledTotal: 0,
      pct: 0,
      openSlots: 0,
      daily,
    }) as MobileDashboardResponse["coverageBySection"][number];

  it("reads each area's count for the day", () => {
    expect(
      buildDayCoverage(
        [
          section("2 West", [
            { dateKey: DATE, filledCount: 3, requiredCount: 4, status: "amber" },
            { dateKey: "2026-11-20", filledCount: 4, requiredCount: 4, status: "green" },
          ]),
        ],
        DATE,
      ),
    ).toEqual([{ focusAreaId: 6, name: "2 West", filled: 3, required: 4 }]);
  });

  it("leaves out areas with nothing to measure that day", () => {
    expect(
      buildDayCoverage(
        [
          section("2 West", [{ dateKey: DATE, filledCount: 0, requiredCount: 4, status: "none" }]),
          section("3 East", [{ dateKey: DATE, filledCount: 2, requiredCount: 0, status: "green" }]),
          section("Rehab", []),
        ],
        DATE,
      ),
    ).toEqual([]);
  });
});

describe("buildDayOpenShifts", () => {
  const openShift = {
    id: "open-1",
    date: DATE,
    focusAreaId: 3,
    focusAreaName: "3 East",
    needed: 1,
    urgency: null,
    state: workedState,
    presentation,
    canVolunteer: true,
    volunteerBlockReason: null,
  } as unknown as MobileOpenShift;

  it("names the shift and job over the area and times", () => {
    expect(buildDayOpenShifts([openShift], DATE, "me")).toEqual([
      {
        id: "open-1",
        title: "Day Shift · RN",
        detail: "3 East · 7:00 AM - 3:00 PM",
        canClaim: true,
      },
    ]);
  });

  it("keeps only the day, and only someone on staff can claim", () => {
    const other = { ...openShift, id: "open-2", date: "2026-11-20" };
    const blocked = { ...openShift, id: "open-3", canVolunteer: false };
    expect(buildDayOpenShifts([openShift, other, blocked], DATE, null)).toEqual([
      expect.objectContaining({ id: "open-1", canClaim: false }),
      expect.objectContaining({ id: "open-3", canClaim: false }),
    ]);
  });
});

describe("buildDayRequests", () => {
  const request = (overrides: Partial<MobileShiftRequest>) =>
    ({
      id: "r",
      type: "pickup",
      status: "pending_approval",
      requesterEmpId: "marcus",
      requesterName: "Marcus Lee",
      requesterShiftDate: DATE,
      targetEmpId: null,
      targetName: null,
      targetShiftDate: null,
      ...overrides,
    }) as MobileShiftRequest;

  const requests = [
    request({ id: "pickup" }),
    request({
      id: "swap",
      type: "swap",
      status: "open",
      requesterEmpId: "grace",
      requesterName: "Grace Kim",
      requesterShiftDate: "2026-11-18",
      targetEmpId: "lena",
      targetName: "Lena Novak",
      targetShiftDate: DATE,
    }),
    request({ id: "done", status: "approved" }),
    request({ id: "elsewhere", requesterShiftDate: "2026-11-21" }),
  ];

  it("shows an approver every request still waiting that touches the day", () => {
    expect(buildDayRequests(requests, DATE, { viewerEmpId: null, canSeeAll: true })).toEqual([
      { id: "pickup", who: "Marcus Lee", detail: "Pickup · Pending approval", tab: "approval" },
      { id: "swap", who: "Grace Kim", detail: "Swap · Waiting on Lena Novak", tab: null },
    ]);
  });

  it("shows staff only their own, named You", () => {
    expect(buildDayRequests(requests, DATE, { viewerEmpId: "marcus", canSeeAll: false })).toEqual([
      { id: "pickup", who: "You", detail: "Pickup · Pending approval", tab: "mine" },
    ]);
    expect(buildDayRequests(requests, DATE, { viewerEmpId: "lena", canSeeAll: false })).toEqual([
      { id: "swap", who: "Grace Kim", detail: "Swap · Waiting on you", tab: "mine" },
    ]);
  });
});

describe("findViewerDay", () => {
  const entry = (overrides: Partial<MobileScheduleEntry>) =>
    ({
      employeeId: "me",
      employeeName: "Marcus Lee",
      date: DATE,
      state: workedState,
      presentation,
      change: null,
      ...overrides,
    }) as unknown as MobileScheduleEntry;

  it("finds the viewer's shift that day", () => {
    expect(findViewerDay([entry({ employeeId: "lena" }), entry({})], DATE, "me")).toEqual({
      title: "Day Shift",
      time: "7:00 AM - 3:00 PM",
    });
  });

  it("is null for a day off or a viewer with no staff record", () => {
    expect(findViewerDay([entry({ date: "2026-11-20" })], DATE, "me")).toBeNull();
    expect(findViewerDay([entry({})], DATE, null)).toBeNull();
  });
});

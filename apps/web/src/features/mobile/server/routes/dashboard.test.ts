// Pin the runtime timezone to UTC (matching production servers) so the
// default current-week range in ./dashboard is stable regardless of the
// local machine timezone the suite runs on.
// Set in vi.hoisted, which runs before the imports: a plain assignment runs
// after them, and a module that builds a date formatter on load keeps the
// machine's timezone.
vi.hoisted(() => {
  process.env.TZ = "UTC";
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const resolveMobileDateRange = vi.fn();
const fetchMobileCoverageSummary = vi.fn();
const fetchMobileShiftRequests = vi.fn();
const fetchMobileOpenShiftContext = vi.fn();
const fetchMobilePublishHistoryRows = vi.fn();
const fetchMobileAcceptedInvitationRows = vi.fn();
const fetchProfileNameRowsByIds = vi.fn();
const fetchMobileScheduleComparisonRows = vi.fn();

const fetchMobileHiddenPeople = vi.fn(async (..._args: unknown[]) => [] as string[]);
const fetchHiddenEmployeeIds = vi.fn(async (..._args: unknown[]) => [] as string[]);
vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobileHiddenPeople: (...args: unknown[]) => fetchMobileHiddenPeople(...args),
  resolveMobileDateRange,
  fetchMobileCoverageSummary,
  fetchMobileShiftRequests,
  fetchMobileOpenShiftContext,
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchHiddenEmployeeIds: (...args: unknown[]) => fetchHiddenEmployeeIds(...args),
  fetchMobilePublishHistoryRows,
  fetchMobileAcceptedInvitationRows,
  fetchProfileNameRowsByIds,
  fetchMobileScheduleComparisonRows,
}));

function mockAuth(overrides: { role: string; canEditShifts?: boolean }) {
  requireMobileAuth.mockResolvedValue({
    currentOrg: { id: "org-1", timezone: "America/Los_Angeles" },
    permissions: { role: overrides.role, canEditShifts: overrides.canEditShifts ?? false },
    serviceClient: {},
  });
}

describe("mobile dashboard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMobileDateRange.mockReturnValue({
      startDate: "2026-05-11",
      endDate: "2026-05-17",
    });
    fetchMobileCoverageSummary.mockResolvedValue({
      openShifts: [],
      totals: { totalRequired: 0, totalFilled: 0, pct: 100, openSlots: 0 },
      byFocusArea: [],
      hasCoverageRequirements: false,
      publishedWindow: "published",
      scheduleRows: [],
    });
    fetchMobileShiftRequests.mockResolvedValue([]);
    fetchMobileOpenShiftContext.mockResolvedValue({
      assignments: [],
      assignmentIdByPair: new Map(),
      focusAreas: [{ id: 1, name: "ICU" }],
      shiftCategories: [],
    });
    fetchMobilePublishHistoryRows.mockResolvedValue([]);
    fetchMobileAcceptedInvitationRows.mockResolvedValue([]);
    fetchProfileNameRowsByIds.mockResolvedValue([]);
    fetchMobileScheduleComparisonRows.mockResolvedValue([]);
  });

  it("rejects a plain user", async () => {
    mockAuth({ role: "user" });

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard"),
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view the admin dashboard.",
    });
  });

  it("leaves a hidden staff member's changes out of the activity feed", async () => {
    mockAuth({ role: "admin", canEditShifts: true });
    const change = (empId: string) => ({
      empId,
      date: "2026-05-12",
      kind: "new",
      fromState: null,
      toState: null,
    });
    fetchMobilePublishHistoryRows.mockResolvedValue([
      {
        published_by: "publisher-1",
        start_date: "2026-05-11",
        end_date: "2026-05-17",
        published_at: "2026-05-12T09:00:00.000Z",
        change_count: 2,
        changes: [change("emp-1"), change("emp-qa")],
      },
    ]);
    fetchMobileHiddenPeople.mockResolvedValueOnce(["qa-person"]);
    fetchHiddenEmployeeIds.mockResolvedValueOnce(["emp-qa"]);

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/dashboard?startDate=2026-05-11&endDate=2026-05-17",
      ),
    } as never);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(fetchHiddenEmployeeIds).toHaveBeenCalledWith({}, "org-1", ["qa-person"]);
    expect(body).toContain("1 shift added");
    expect(body).not.toContain("2 shifts added");
  });

  it("returns a dashboard payload for an admin", async () => {
    mockAuth({ role: "admin", canEditShifts: true });
    fetchMobileCoverageSummary.mockResolvedValue({
      openShifts: [
        {
          id: "shift-1",
          date: "2026-05-12",
          focusAreaId: 1,
          focusAreaName: "ICU",
          needed: 2,
          state: {
            kind: "worked",
            segments: [{ shiftId: 1, jobId: 1, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          presentation: {
            label: "D",
            shiftName: "Day Shift",
            focusAreaId: 1,
            focusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            segments: [],
          },
          canVolunteer: true,
          volunteerBlockReason: null,
        },
      ],
      // No coverage requirements configured in this fixture — the real
      // engine reports the section purely from its (unmet) open shifts.
      totals: { totalRequired: 2, totalFilled: 0, pct: 0, openSlots: 2 },
      byFocusArea: [
        { focusAreaId: 1, focusAreaName: "ICU", requiredTotal: 2, filledTotal: 0, pct: 0 },
      ],
      hasCoverageRequirements: false,
      publishedWindow: "published",
      scheduleRows: [],
    });

    fetchMobileHiddenPeople.mockResolvedValueOnce(["qa-person"]);

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/dashboard?startDate=2026-05-11&endDate=2026-05-17",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    // One lookup serves every loader that reads shifts or staff.
    expect(fetchMobileHiddenPeople).toHaveBeenCalledTimes(1);
    expect(fetchMobileOpenShiftContext).toHaveBeenCalledWith({}, "org-1", ["qa-person"]);
    expect(payload.range).toEqual({ startDate: "2026-05-11", endDate: "2026-05-17" });
    expect(payload.overtimeThresholdHours).toBe(40);
    expect(payload.coverageBySection).toEqual([
      {
        focusAreaId: 1,
        focusAreaName: "ICU",
        requiredTotal: 2,
        filledTotal: 0,
        pct: 0,
        openSlots: 2,
        daily: [],
      },
    ]);
    expect(payload.openShifts).toHaveLength(1);
    expect(fetchMobileCoverageSummary).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        showAll: true,
        timeZone: "America/Los_Angeles",
        startDate: "2026-05-11",
        endDate: "2026-05-17",
        hiddenUserIds: ["qa-person"],
      },
    );
    expect(fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
    expect(fetchMobileScheduleComparisonRows).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        startDate: "2026-05-11",
        endDate: "2026-05-17",
        hiddenUserIds: ["qa-person"],
      },
    );
    expect(payload.metrics.draftSummary).toEqual({
      newCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      total: 0,
    });
  });

  it("does not load or expose draft metrics without schedule-edit permission", async () => {
    mockAuth({ role: "admin", canEditShifts: false });

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileScheduleComparisonRows).not.toHaveBeenCalled();
    expect(payload.metrics.draftSummary).toBeNull();
  });

  it("defaults to the current week (not resolveMobileDateRange's forward-looking window) when no query params are given", async () => {
    mockAuth({ role: "admin" });

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    // resolveMobileDateRange is mocked to return a fixed "2026-05-11..17"
    // range — if the route had called it for the no-query case, that's what
    // we'd see here. Getting anything else proves the dedicated
    // current-week default ran instead.
    expect(payload.range).not.toEqual({ startDate: "2026-05-11", endDate: "2026-05-17" });
    expect(resolveMobileDateRange).not.toHaveBeenCalled();
    const start = new Date(`${payload.range.startDate}T00:00:00`);
    const end = new Date(`${payload.range.endDate}T00:00:00`);
    expect(start.getDay()).toBe(0); // Sunday
    expect((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)).toBe(6);
  });

  it("lists pending approvals in actionQueue for a super_admin", async () => {
    mockAuth({ role: "super_admin" });
    fetchMobileShiftRequests.mockResolvedValue([
      {
        id: "8d3f4c1e-2b6a-4f0e-9c7d-1a2b3c4d5e6f",
        orgId: "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f",
        type: "pickup",
        status: "pending_approval",
        requesterEmpId: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
        requesterName: "Alex Rivera",
        // Far-future/never-expiring so resolveActiveShiftRequests's expiry
        // and "already started" checks don't filter this out regardless of
        // when the test actually runs.
        requesterShiftDate: "2099-01-01",
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 1, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        requesterPresentation: {
          label: "D",
          shiftName: "Day Shift",
          focusAreaId: 1,
          focusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2099-01-02T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-05-10T09:00:00.000Z",
        updatedAt: "2026-05-10T09:00:00.000Z",
      },
    ]);

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
    expect(payload.actionQueue).toHaveLength(1);
    expect(payload.actionQueue[0].requesterName).toBe("Alex Rivera");
    expect(payload.metrics.pendingApprovalsCount).toBe(1);
  });

  it("returns 400 for an invalid query", async () => {
    mockAuth({ role: "admin" });

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard?startDate=not-a-date"),
    } as never);

    expect(response.status).toBe(400);
  });
});

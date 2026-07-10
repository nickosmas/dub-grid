// Pin the runtime timezone to UTC (matching production servers) so the
// default current-week range in ./dashboard is stable regardless of the
// local machine timezone the suite runs on.
process.env.TZ = "UTC";

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const resolveMobileDateRange = vi.fn();
const fetchMobileOpenShifts = vi.fn();
const fetchMobileShiftRequests = vi.fn();
const fetchMobileOpenShiftContextRows = vi.fn();
const fetchPublishedMobileScheduleRows = vi.fn();
const fetchMobilePublishHistoryRows = vi.fn();
const fetchProfileNameRowsByIds = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  resolveMobileDateRange,
  fetchMobileOpenShifts,
  fetchMobileShiftRequests,
}));

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileOpenShiftContextRows,
  fetchPublishedMobileScheduleRows,
  fetchMobilePublishHistoryRows,
  fetchProfileNameRowsByIds,
}));

function mockAuth(overrides: { role: string }) {
  requireMobileAuth.mockResolvedValue({
    currentOrg: { id: "org-1", timezone: "America/Los_Angeles" },
    permissions: { role: overrides.role },
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
    fetchMobileOpenShifts.mockResolvedValue([]);
    fetchMobileShiftRequests.mockResolvedValue([]);
    fetchMobileOpenShiftContextRows.mockResolvedValue({
      shiftCategoryRows: [],
      coverageRequirementRows: [],
    });
    fetchPublishedMobileScheduleRows.mockResolvedValue([]);
    fetchMobilePublishHistoryRows.mockResolvedValue([]);
    fetchProfileNameRowsByIds.mockResolvedValue([]);
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

  it("returns a dashboard payload for an admin", async () => {
    mockAuth({ role: "admin" });
    fetchMobileOpenShifts.mockResolvedValue([
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
    ]);

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/dashboard?startDate=2026-05-11&endDate=2026-05-17",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.range).toEqual({ startDate: "2026-05-11", endDate: "2026-05-17" });
    expect(payload.overtimeThresholdHours).toBe(40);
    expect(payload.coverageBySection).toEqual([
      { focusAreaId: 1, focusAreaName: "ICU", openSlots: 2 },
    ]);
    expect(payload.openShifts).toHaveLength(1);
    expect(fetchMobileOpenShifts).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        showAll: true,
        timeZone: "America/Los_Angeles",
        startDate: "2026-05-11",
        endDate: "2026-05-17",
      },
    );
    expect(fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
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

  it("fetches shift requests for a super_admin (for the pending-approvals metric) but omits them from actionQueue", async () => {
    mockAuth({ role: "super_admin" });
    fetchMobileShiftRequests.mockResolvedValue([
      { id: "req-1", status: "pending_approval" },
    ]);

    const { GET } = await import("./dashboard");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/dashboard"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledTimes(1);
    expect(payload.actionQueue).toEqual([]);
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

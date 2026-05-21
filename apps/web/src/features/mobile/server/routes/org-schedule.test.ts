import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchMobileScheduleEntries = vi.fn();
const resolveMobileDateRange = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchMobileScheduleEntries,
  resolveMobileDateRange,
}));

describe("mobile org-schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMobileDateRange.mockReturnValue({
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });
  });

  it("rejects users who cannot view the org schedule", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        level: 1,
        canViewSchedule: false,
        canEditShifts: false,
        canApproveShiftRequests: false,
        canManageEmployees: false,
      },
      serviceClient: {},
    });

    const { GET } = await import("./org-schedule");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/org/schedule"),
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view the organization schedule.",
    });
  });

  it("returns published entries for users with schedule view access", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        level: 0,
        canViewSchedule: true,
        canEditShifts: false,
        canApproveShiftRequests: false,
        canManageEmployees: false,
      },
      serviceClient: {},
    });
    fetchMobileScheduleEntries.mockResolvedValue([
      {
        employeeId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Mina Diaz",
        date: "2026-04-16",
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
          focusAreaId: null,
          focusAreaName: null,
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        publishedAt: "2026-04-15T18:30:00.000Z",
        publishedByName: "Mina Diaz",
      },
    ]);

    const { GET } = await import("./org-schedule");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/org/schedule"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileScheduleEntries).toHaveBeenCalledWith({}, {
      orgId: "org-1",
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });
    expect(payload.entries).toHaveLength(1);
    expect(payload.range).toEqual({
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });
  });

  it("allows schedule editors to view the team schedule without approval permission", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
        level: 1,
        canViewSchedule: false,
        canEditShifts: true,
        canApproveShiftRequests: false,
        canManageEmployees: false,
      },
      serviceClient: {},
    });
    fetchMobileScheduleEntries.mockResolvedValue([]);

    const { GET } = await import("./org-schedule");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/org/schedule"),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileScheduleEntries).toHaveBeenCalledWith({}, {
      orgId: "org-1",
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });
  });
});

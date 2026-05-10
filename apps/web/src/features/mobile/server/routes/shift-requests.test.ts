import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileShiftRequests = vi.fn();
const fetchMobileOpenShifts = vi.fn();
const fetchMobileScheduleEntries = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileOpenShifts,
  fetchMobileScheduleEntries,
  fetchMobileShiftRequests,
}));

describe("mobile shift-requests route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json(
        { error: "Unauthenticated" },
        { status: 401 },
      ),
    });

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns 400 for invalid schedule query ranges", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests?startDate=2026-04-30&endDate=2026-04-01",
      ),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid query" });
    expect(fetchMobileShiftRequests).not.toHaveBeenCalled();
  });

  it("returns an empty request list when a regular mobile user has no linked employee", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue(null);
    fetchMobileShiftRequests.mockResolvedValue([]);
    fetchMobileOpenShifts.mockResolvedValue([]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).not.toHaveBeenCalled();
    expect(fetchMobileOpenShifts).not.toHaveBeenCalled();
    expect(payload).toEqual({ requests: [], openShifts: [] });
  });

  it("includes open pickup requests for regular linked mobile users", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: "emp-1" });
    fetchMobileShiftRequests.mockResolvedValue([]);
    fetchMobileOpenShifts.mockResolvedValue([]);
    fetchMobileScheduleEntries.mockResolvedValue([]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: "emp-1",
        includeOpenPickupRequests: true,
        startDate: "2026-04-18",
        endDate: "2026-05-01",
      },
    );
    expect(fetchMobileOpenShifts).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employee: { id: "emp-1" },
        startDate: "2026-04-18",
        endDate: "2026-05-01",
        showAll: false,
        timeZone: "America/Los_Angeles",
      },
    );
    expect(fetchMobileScheduleEntries).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: "emp-1",
        startDate: expect.any(String),
        endDate: expect.any(String),
      },
    );
  });

  it("passes the requested date range to computed mobile open shifts", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: "emp-1" });
    fetchMobileShiftRequests.mockResolvedValue([]);
    fetchMobileOpenShifts.mockResolvedValue([]);
    fetchMobileScheduleEntries.mockResolvedValue([]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests?startDate=2026-04-19&endDate=2026-04-25",
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: "emp-1",
        includeOpenPickupRequests: true,
        startDate: "2026-04-19",
        endDate: "2026-04-25",
      },
    );
    expect(fetchMobileOpenShifts).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employee: { id: "emp-1" },
        startDate: "2026-04-19",
        endDate: "2026-04-25",
        showAll: false,
        timeZone: "America/Los_Angeles",
      },
    );
    expect(fetchMobileScheduleEntries).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: "emp-1",
        startDate: "2026-04-19",
        endDate: "2026-04-25",
      },
    );
  });

  it("filters conflicting open pickup requests before returning them to mobile", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: "emp-1" });
    fetchMobileShiftRequests.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "pickup",
        status: "open",
        requesterEmpId: "22222222-2222-4222-8222-222222222222",
        requesterName: "Jordan Lee",
        requesterShiftDate: "2026-04-19",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        requesterPresentation: {
          label: "Morning Pickup",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: "07:00:00",
          customEndTime: "15:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-20T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "pickup",
        status: "open",
        requesterEmpId: "44444444-4444-4444-8444-444444444444",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-19",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        requesterPresentation: {
          label: "Evening Pickup",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 2, jobId: 21, position: 0 }],
          absenceTypeId: null,
          customStartTime: "15:00:00",
          customEndTime: "23:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-20T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "swap",
        status: "open",
        requesterEmpId: "66666666-6666-4666-8666-666666666666",
        requesterName: "Mina Diaz",
        requesterShiftDate: "2026-04-19",
        targetEmpId: "77777777-7777-4777-8777-777777777777",
        targetName: "Alex Kim",
        targetShiftDate: "2026-04-20",
        requesterPresentation: {
          label: "Coverage Request",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: "07:00:00",
          customEndTime: "15:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-20T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
      },
    ]);
    fetchMobileOpenShifts.mockResolvedValue([]);
    fetchMobileScheduleEntries.mockResolvedValue([
      {
        employeeId: "88888888-8888-4888-8888-888888888888",
        employeeName: "Alex Kim",
        date: "2026-04-19",
        state: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Day Shift",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        publishedAt: "2026-04-18T00:00:00.000Z",
        publishedByName: "Mina Diaz",
      },
    ]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);
    const payload = await response.json();

    expect(payload.requests).toEqual([
      expect.objectContaining({ id: "33333333-3333-4333-8333-333333333333" }),
      expect.objectContaining({ id: "55555555-5555-4555-8555-555555555555" }),
    ]);
  });

  it("filters already-started open pickup requests before returning them to mobile", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: "emp-1" });
    fetchMobileShiftRequests.mockResolvedValue([
      {
        id: "99999999-9999-4999-8999-999999999999",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "pickup",
        status: "open",
        requesterEmpId: "22222222-2222-4222-8222-222222222222",
        requesterName: "Jordan Lee",
        requesterShiftDate: "2026-04-18",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        requesterPresentation: {
          label: "Morning Pickup",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "04:00:00",
          endTime: "12:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: "04:00:00",
          customEndTime: "12:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-19T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
      {
        id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "pickup",
        status: "open",
        requesterEmpId: "33333333-3333-4333-8333-333333333333",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-18",
        targetEmpId: null,
        targetName: null,
        targetShiftDate: null,
        requesterPresentation: {
          label: "Evening Pickup",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [],
        },
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 2, jobId: 21, position: 0 }],
          absenceTypeId: null,
          customStartTime: "15:00:00",
          customEndTime: "23:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-19T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
    ]);
    fetchMobileOpenShifts.mockResolvedValue([]);
    fetchMobileScheduleEntries.mockResolvedValue([]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);
    const payload = await response.json();

    expect(payload.requests).toEqual([
      expect.objectContaining({ id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa" }),
    ]);
  });

  it("returns all requests and open shifts for schedule editors without a linked employee", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: true,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue(null);
    fetchMobileShiftRequests.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "swap",
        status: "open",
        requesterEmpId: "22222222-2222-4222-8222-222222222222",
        requesterName: "Jordan Lee",
        requesterShiftDate: "2026-04-19",
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: "07:00:00",
          customEndTime: "15:00:00",
          seriesId: null,
          fromRecurring: false,
        },
        requesterPresentation: {
          label: "Coverage Request",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
        targetEmpId: "33333333-3333-4333-8333-333333333333",
        targetName: "Alex Kim",
        targetShiftDate: "2026-04-20",
        targetState: null,
        targetPresentation: null,
        absenceTypeId: null,
        parentRequestId: null,
        adminUserId: null,
        adminNote: null,
        expiresAt: "2026-04-20T00:00:00.000Z",
        resolvedAt: null,
        createdAt: "2026-04-18T00:00:00.000Z",
        updatedAt: "2026-04-18T00:00:00.000Z",
      },
    ]);
    fetchMobileOpenShifts.mockResolvedValue([
      {
        id: "open-1",
        date: "2026-04-19",
        focusAreaId: 2,
        focusAreaName: "Skilled Nursing",
        needed: 1,
        state: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Day Shift",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [],
        },
      },
    ]);

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: undefined,
        includeOpenPickupRequests: false,
        startDate: "2026-04-18",
        endDate: "2026-05-01",
      },
    );
    expect(fetchMobileOpenShifts).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        startDate: "2026-04-18",
        endDate: "2026-05-01",
        showAll: true,
        timeZone: "America/Los_Angeles",
      },
    );
    expect(fetchMobileScheduleEntries).not.toHaveBeenCalled();
    expect(payload).toEqual({
      requests: [
        expect.objectContaining({
          id: "11111111-1111-4111-8111-111111111111",
          type: "swap",
          status: "open",
        }),
      ],
      openShifts: [
        expect.objectContaining({
          id: "open-1",
          date: "2026-04-19",
          focusAreaId: 2,
          needed: 1,
        }),
      ],
    });
  });

  it("rejects swap options when the requester is not the linked employee", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });

    const { GET } = await import("./shift-swap-options");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests/swap-options?requesterEmpId=22222222-2222-4222-8222-222222222222&requesterShiftDate=2026-04-19&startDate=2026-04-19&endDate=2026-04-25",
      ),
    } as never);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You don't have permission to view those swap options.",
    });
    expect(fetchMobileScheduleEntries).not.toHaveBeenCalled();
  });

  it("returns eligible swap options for a regular linked employee", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
        timezone: "America/Los_Angeles",
      },
      permissions: {
        canEditShifts: false,
        canManageEmployees: false,
        canApproveShiftRequests: false,
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
    fetchMobileScheduleEntries.mockResolvedValue([
      {
        employeeId: "11111111-1111-4111-8111-111111111111",
        employeeName: "Alex Kim",
        employeeFocusAreaIds: [2],
        date: "2026-04-19",
        state: {
          kind: "worked",
          segments: [{ shiftId: 10, jobId: 20, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Day",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [
            {
              shiftId: 10,
              jobId: 20,
              label: "Day",
              shiftName: "Day",
              startTime: "07:00:00",
              endTime: "15:00:00",
              focusAreaId: 2,
              displayFocusAreaName: "ICU",
            },
          ],
        },
        publishedAt: "2026-04-18T00:00:00.000Z",
        publishedByName: "Mina Diaz",
      },
      {
        employeeId: "22222222-2222-4222-8222-222222222222",
        employeeName: "Jordan Lee",
        employeeFocusAreaIds: [2],
        date: "2026-04-20",
        state: {
          kind: "worked",
          segments: [{ shiftId: 11, jobId: 21, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Evening",
          focusAreaId: 2,
          focusAreaName: "ICU",
          displayFocusAreaName: "ICU",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [
            {
              shiftId: 11,
              jobId: 21,
              label: "Evening",
              shiftName: "Evening",
              startTime: "15:00:00",
              endTime: "23:00:00",
              focusAreaId: 2,
              displayFocusAreaName: "ICU",
            },
          ],
        },
        publishedAt: "2026-04-18T00:00:00.000Z",
        publishedByName: "Mina Diaz",
      },
      {
        employeeId: "33333333-3333-4333-8333-333333333333",
        employeeName: "Bri Shaw",
        employeeFocusAreaIds: [1],
        date: "2026-04-20",
        state: {
          kind: "worked",
          segments: [{ shiftId: 12, jobId: 22, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Emergency",
          focusAreaId: 1,
          focusAreaName: "Emergency",
          displayFocusAreaName: "Emergency",
          startTime: "07:00:00",
          endTime: "15:00:00",
          segments: [
            {
              shiftId: 12,
              jobId: 22,
              label: "Emergency",
              shiftName: "Emergency",
              startTime: "07:00:00",
              endTime: "15:00:00",
              focusAreaId: 1,
              displayFocusAreaName: "Emergency",
            },
          ],
        },
        publishedAt: "2026-04-18T00:00:00.000Z",
        publishedByName: "Mina Diaz",
      },
    ]);

    const { GET } = await import("./shift-swap-options");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests/swap-options?requesterEmpId=11111111-1111-4111-8111-111111111111&requesterShiftDate=2026-04-19&startDate=2026-04-19&endDate=2026-04-25",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileScheduleEntries).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        startDate: "2026-04-19",
        endDate: "2026-04-25",
      },
    );
    expect(payload.entries).toEqual([
      expect.objectContaining({
        employeeId: "22222222-2222-4222-8222-222222222222",
        employeeName: "Jordan Lee",
      }),
    ]);
  });
});

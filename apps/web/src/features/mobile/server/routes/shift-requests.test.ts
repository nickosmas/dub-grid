import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileShiftRequests = vi.fn();
const fetchMobileOpenShifts = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileOpenShifts,
  fetchMobileShiftRequests,
}));

describe("mobile shift-requests route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns an empty request list when a regular mobile user has no linked employee", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
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
      },
      permissions: {
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
      },
    );
    expect(fetchMobileOpenShifts).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employee: { id: "emp-1" },
      },
    );
  });

  it("passes the requested date range to computed mobile open shifts", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: {
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
      },
    );
  });
});

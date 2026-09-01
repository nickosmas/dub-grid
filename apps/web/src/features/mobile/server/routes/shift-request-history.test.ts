import { NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileShiftRequestHistory = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileShiftRequestHistory,
}));

function makeAuth(overrides?: {
  canApproveShiftRequests?: boolean;
  canEditShifts?: boolean;
  canManageEmployees?: boolean;
}) {
  return {
    currentOrg: { id: "org-1", timezone: "UTC" },
    permissions: {
      canApproveShiftRequests: overrides?.canApproveShiftRequests ?? false,
      canEditShifts: overrides?.canEditShifts ?? false,
      canManageEmployees: overrides?.canManageEmployees ?? false,
    },
    serviceClient: {},
    user: { id: "user-1" },
    userClient: {},
  };
}

describe("mobile shift-request history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMobileShiftRequestHistory.mockResolvedValue({ requests: [], nextCursor: null });
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const { GET } = await import("./shift-request-history");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests/history"),
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthenticated" });
  });

  it("rejects incomplete cursors before loading history", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth());

    const { GET } = await import("./shift-request-history");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests/history?cursorCreatedAt=2026-04-01T10%3A00%3A00.000Z",
      ),
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: API_ERRORS.INVALID_REQUEST });
    expect(fetchLinkedEmployeeForUser).not.toHaveBeenCalled();
    expect(fetchMobileShiftRequestHistory).not.toHaveBeenCalled();
  });

  it("scopes regular users to their linked employee and passes the cursor", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth());
    fetchLinkedEmployeeForUser.mockResolvedValue({ id: "emp-1" });

    const { GET } = await import("./shift-request-history");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/shift-requests/history?limit=20&cursorCreatedAt=2026-04-01T10%3A00%3A00.000Z&cursorId=00000000-0000-4000-8000-000000000001",
      ),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequestHistory).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        employeeId: "emp-1",
        limit: 20,
        cursor: {
          createdAt: "2026-04-01T10:00:00.000Z",
          id: "00000000-0000-4000-8000-000000000001",
        },
      },
    );
  });

  it("lets authorized managers load organization history without an employee filter", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth({ canApproveShiftRequests: true }));
    fetchLinkedEmployeeForUser.mockResolvedValue(null);

    const { GET } = await import("./shift-request-history");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests/history"),
    } as never);

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequestHistory).toHaveBeenCalledWith(
      {},
      {
        orgId: "org-1",
        limit: 25,
      },
    );
  });

  it("returns an empty page when a regular user has no linked employee", async () => {
    requireMobileAuth.mockResolvedValue(makeAuth());
    fetchLinkedEmployeeForUser.mockResolvedValue(null);

    const { GET } = await import("./shift-request-history");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests/history"),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [], nextCursor: null });
    expect(fetchMobileShiftRequestHistory).not.toHaveBeenCalled();
  });
});

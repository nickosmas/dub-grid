import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileShiftRequests = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileShiftRequests,
}));

describe("mobile shift-requests route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns an empty request list when no requests match the mobile user", async () => {
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

    const { GET } = await import("./shift-requests");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/shift-requests"),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileShiftRequests).toHaveBeenCalledWith({}, {
      orgId: "org-1",
      employeeId: undefined,
    });
    expect(payload).toEqual({ requests: [] });
  });
});

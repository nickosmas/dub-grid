import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileScheduleEntries = vi.fn();
const resolveMobileDateRange = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileScheduleEntries,
  resolveMobileDateRange,
}));

describe("mobile me-schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMobileDateRange.mockReturnValue({
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });
  });

  it("returns the auth failure response unchanged", async () => {
    requireMobileAuth.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    });

    const { GET } = await import("./me-schedule");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/me/schedule"),
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthenticated" });
  });

  it("returns an empty response when the user is not linked to a staff record", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue(null);

    const { GET } = await import("./me-schedule");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/me/schedule?startDate=2026-04-16&endDate=2026-04-22",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMobileScheduleEntries).not.toHaveBeenCalled();
    expect(payload).toEqual({
      employee: null,
      range: {
        startDate: "2026-04-16",
        endDate: "2026-04-22",
      },
      entries: [],
    });
  });

  it("answers browser preflight requests for schedule reads", async () => {
    const { OPTIONS } = await import("./me-schedule");
    const response = await OPTIONS(
      new Request("http://localhost/api/mobile/v1/me/schedule", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8081",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization",
        },
      }) as never,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
  });

  it("returns the linked employee with home focus areas for schedule reads", async () => {
    requireMobileAuth.mockResolvedValue({
      currentOrg: {
        id: "org-1",
      },
      permissions: { canPublishSchedule: false, level: 0 },
      serviceClient: {},
      user: {
        id: "user-1",
      },
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      firstName: "Alex",
      lastName: "Kim",
      status: "active",
      focusAreaIds: [2],
      departmentIds: [],
    });
    fetchMobileScheduleEntries.mockResolvedValue([]);

    const { GET } = await import("./me-schedule");
    const response = await GET({
      nextUrl: new URL(
        "http://localhost/api/mobile/v1/me/schedule?startDate=2026-04-16&endDate=2026-04-22",
      ),
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      employee: {
        id: "11111111-1111-4111-8111-111111111111",
        firstName: "Alex",
        lastName: "Kim",
        status: "active",
        focusAreaIds: [2],
        departmentIds: [],
      },
      range: {
        startDate: "2026-04-16",
        endDate: "2026-04-22",
      },
      entries: [],
    });
  });
});

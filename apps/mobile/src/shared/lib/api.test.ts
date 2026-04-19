import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("mobileApiRequest", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://app.dubgrid.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds bearer auth and parses a successful payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { mobileApiRequest } = await import("./api");

    const result = await mobileApiRequest(
      "/api/mobile/v1/ping",
      "token-123",
      { method: "GET" },
      (value) => value as { ok: boolean },
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/ping",
      expect.any(Object),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("adds schedule query params when a mobile date range is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        employee: null,
        range: {
          startDate: "2026-04-16",
          endDate: "2026-04-22",
        },
        entries: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getMySchedule } = await import("./api");

    await getMySchedule("token-123", {
      startDate: "2026-04-16",
      endDate: "2026-04-22",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/me/schedule?startDate=2026-04-16&endDate=2026-04-22",
      expect.any(Object),
    );
  });

  it("parses bootstrap responses that omit linked employee focusAreaIds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          email: "mina@dubgrid.com",
          firstName: "Mina",
          lastName: "Diaz",
        },
        currentOrg: {
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          name: "DubGrid Health",
          slug: "dubgrid-health",
          timezone: "America/Los_Angeles",
          shiftDisplayMode: "code",
          labels: {
            focusArea: "Focus Areas",
            certification: "Certifications",
            role: "Roles",
            department: "Departments",
          },
          featureFlags: {},
        },
        memberships: [
          {
            id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
            name: "DubGrid Health",
            slug: "dubgrid-health",
            orgRole: "admin",
            platformRole: "none",
            isCurrent: true,
          },
        ],
        effectiveRole: "admin",
        permissions: {
          canViewSchedule: true,
          canEditShifts: false,
          canPublishSchedule: false,
          canApplyRecurringSchedule: false,
          canEditNotes: false,
          canViewRecurringShifts: false,
          canManageRecurringShifts: false,
          canManageShiftSeries: false,
          canViewStaff: true,
          canViewEmployeeDetails: true,
          canManageEmployees: true,
          canViewFocusAreas: true,
          canManageFocusAreas: false,
          canViewShiftCodes: false,
          canManageShiftCodes: false,
          canViewIndicatorTypes: false,
          canManageIndicatorTypes: false,
          canManageOrgSettings: false,
          canViewOrgLabels: false,
          canManageOrgLabels: false,
          canViewCoverageRequirements: false,
          canManageCoverageRequirements: false,
          canApproveShiftRequests: true,
          canViewDashboardAnalytics: true,
        },
        linkedEmployee: {
          id: "11111111-1111-4111-8111-111111111111",
          firstName: "Mina",
          lastName: "Diaz",
          status: "active",
        },
        absenceTypes: [],
        focusAreas: [],
        unreadNotificationCount: 0,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getBootstrap } = await import("./api");

    const result = await getBootstrap("token-123");

    expect(result.linkedEmployee?.focusAreaIds).toEqual([]);
  });

  it("surfaces API error messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Forbidden" }),
      headers: {
        get: () => "application/json",
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    const { mobileApiRequest } = await import("./api");

    await expect(
      mobileApiRequest(
        "/api/mobile/v1/ping",
        "token-123",
        { method: "GET" },
        (value) => value,
      ),
    ).rejects.toThrow("Forbidden");
  });

  it("turns fetch failures into actionable mobile backend guidance", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Load failed"));

    vi.stubGlobal("fetch", fetchMock);
    const { lookupWorkspace } = await import("./api");

    await expect(lookupWorkspace("calmhaven")).rejects.toThrow(
      "Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local",
    );
  });

  it("surfaces non-JSON 404 responses as backend configuration errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      url: "https://www.dubgrid.com/api/mobile/v1/auth/workspace?slug=calmhaven",
      json: async () => {
        throw new Error("Unexpected token <");
      },
      headers: {
        get: (name: string) =>
          name === "content-type" ? "text/html; charset=utf-8" : null,
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    const { lookupWorkspace } = await import("./api");

    await expect(lookupWorkspace("calmhaven")).rejects.toThrow(
      "is not serving the mobile API endpoint /api/mobile/v1/auth/workspace",
    );
  });

  it("sends JSON content headers for body-based mobile requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresIn: 3600,
          tokenType: "bearer",
        },
        workspace: {
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          name: "Calmhaven",
          slug: "calmhaven",
        },
        user: {
          id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          email: "user@example.com",
          firstName: "Mina",
          lastName: "Diaz",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { loginToWorkspace } = await import("./api");

    await loginToWorkspace({
      workspaceSlug: "calmhaven",
      email: "user@example.com",
      password: "password",
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

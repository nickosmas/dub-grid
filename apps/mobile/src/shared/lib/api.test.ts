import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createEphemeralSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("./supabase", () => ({
  createEphemeralSupabaseClient,
}));

describe("mobileApiRequest", () => {
  beforeEach(() => {
    createEphemeralSupabaseClient.mockReset();
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://app.dubgrid.com");
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("adds shift request query params when a mobile date range is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requests: [],
        openShifts: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getShiftRequests } = await import("./api");

    await getShiftRequests("token-123", {
      startDate: "2026-04-19",
      endDate: "2026-04-25",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/shift-requests?startDate=2026-04-19&endDate=2026-04-25",
      expect.any(Object),
    );
  });

  it("adds both cursor fields when loading another request-history page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ requests: [], nextCursor: null }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getShiftRequestHistory } = await import("./api");

    await getShiftRequestHistory("token-123", {
      limit: 25,
      cursorCreatedAt: "2026-04-01T10:00:00.000Z",
      cursorId: "00000000-0000-4000-8000-000000000001",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/shift-requests/history?limit=25&cursorCreatedAt=2026-04-01T10%3A00%3A00.000Z&cursorId=00000000-0000-4000-8000-000000000001",
      expect.any(Object),
    );
  });

  it("adds swap option query params when requesting mobile swap targets", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        range: {
          startDate: "2026-04-19",
          endDate: "2026-04-25",
        },
        entries: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getShiftSwapOptions } = await import("./api");

    await getShiftSwapOptions("token-123", {
      requesterEmpId: "33333333-3333-4333-8333-333333333333",
      requesterShiftDate: "2026-04-19",
      startDate: "2026-04-19",
      endDate: "2026-04-25",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/shift-requests/swap-options?requesterEmpId=33333333-3333-4333-8333-333333333333&requesterShiftDate=2026-04-19&startDate=2026-04-19&endDate=2026-04-25",
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
          canEditScheduleIndicators: false,
          canViewRecurringShifts: false,
          canManageRecurringShifts: false,
          canManageShiftSeries: false,
          canViewStaff: true,
          canViewEmployeeDetails: true,
          canManageEmployees: true,
          canViewFocusAreas: true,
          canManageFocusAreas: false,
          canViewScheduleDefinitions: false,
          canManageScheduleDefinitions: false,
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
      mobileApiRequest("/api/mobile/v1/ping", "token-123", { method: "GET" }, (value) => value),
    ).rejects.toThrow("Forbidden");
  });

  it("turns fetch failures into client-friendly connection guidance", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Load failed"));

    vi.stubGlobal("fetch", fetchMock);
    const { lookupOrganization } = await import("./api");

    await expect(lookupOrganization("calmhaven")).rejects.toThrow(
      "We couldn't connect to DubGrid from this device. Check your internet connection and try again.",
    );
  });

  it("times out stalled mobile API requests", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );

    vi.stubGlobal("fetch", fetchMock);
    const { loginToOrganization } = await import("./api");

    const loginPromise = loginToOrganization({
      orgSlug: "calmhaven",
      email: "mina@dubgrid.com",
      password: "super-secret",
    });
    const assertion = expect(loginPromise).rejects.toThrow(
      "DubGrid took too long to respond. Check your internet connection and try again.",
    );

    await vi.advanceTimersByTimeAsync(15_000);

    await assertion;
  });

  it("surfaces non-JSON 404 responses as client-friendly service errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      url: "https://www.dubgrid.com/api/mobile/v1/auth/organization?slug=calmhaven",
      json: async () => {
        throw new Error("Unexpected token <");
      },
      headers: {
        get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null),
      },
    });

    vi.stubGlobal("fetch", fetchMock);
    const { lookupOrganization } = await import("./api");

    await expect(lookupOrganization("calmhaven")).rejects.toThrow(
      "DubGrid isn't responding correctly right now. Try again in a moment.",
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
        organization: {
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
    const { loginToOrganization } = await import("./api");

    await loginToOrganization({
      orgSlug: "calmhaven",
      email: "user@example.com",
      password: "password",
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(request.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("refreshes the MFA-verified session before returning it", async () => {
    vi.resetModules();

    const setSession = vi.fn().mockResolvedValue({ error: null });
    const challengeAndVerify = vi.fn().mockResolvedValue({
      data: {
        access_token: "challenge-token",
        refresh_token: "challenge-refresh",
        expires_in: 3600,
        token_type: "bearer",
      },
      error: null,
    });
    const refreshSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "verified-token",
          refresh_token: "verified-refresh",
          expires_in: 3600,
          token_type: "bearer",
        },
      },
      error: null,
    });
    createEphemeralSupabaseClient.mockReturnValue({
      auth: {
        setSession,
        mfa: {
          challengeAndVerify,
        },
        refreshSession,
      },
    });

    const { verifyMobileTotpFactor } = await import("./api");

    const result = await verifyMobileTotpFactor({
      session: {
        accessToken: "pending-token",
        refreshToken: "pending-refresh",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      factorId: "factor-123",
      code: "123456",
    });

    expect(createEphemeralSupabaseClient).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledWith({
      access_token: "pending-token",
      refresh_token: "pending-refresh",
    });
    expect(challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-123",
      code: "123456",
    });
    expect(refreshSession).toHaveBeenCalledWith({
      refresh_token: "challenge-refresh",
    });
    expect(result).toEqual({
      accessToken: "verified-token",
      refreshToken: "verified-refresh",
      expiresIn: 3600,
      tokenType: "bearer",
    });
    vi.resetModules();
  });

  it("does not register session presence from the mobile web runtime", async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    const { registerMobileSessionPresence } = await import("./api");

    await expect(registerMobileSessionPresence("token-123")).resolves.toEqual({
      success: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the native model and app version, with safe platform fallbacks", async () => {
    const { getNativeSessionMetadata } = await import("./api");

    expect(getNativeSessionMetadata("ios", "iPhone 16 Pro", "1.4.0")).toEqual({
      deviceLabel: "iPhone 16 Pro",
      appVersion: "1.4.0",
    });
    expect(getNativeSessionMetadata("android", null, null)).toEqual({
      deviceLabel: "Android device",
      appVersion: null,
    });
  });

  it("loads profile notification preferences through the mobile profile endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        prefs: {
          schedule: { in_app: true, email: false },
          shift_requests: { in_app: true, email: true },
          system: { in_app: true, email: false },
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getProfileNotificationPreferences } = await import("./api");

    const result = await getProfileNotificationPreferences("token-123");

    expect(result.prefs.shift_requests.email).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/profile/notification-preferences",
      expect.any(Object),
    );
  });

  it("loads and revokes profile sessions through the mobile profile endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              platform: "ios",
              appVersion: null,
              deviceLabel: "DubGrid Mobile on iOS",
              browserName: null,
              browserVersion: null,
              ipAddress: null,
              locationCity: null,
              locationCountry: null,
              lastActiveAt: "2024-01-03T00:00:00.000Z",
              createdAt: "2024-01-01T00:00:00.000Z",
              refreshTokenHash: "hash",
              isCurrent: true,
            },
          ],
          stale: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    vi.stubGlobal("fetch", fetchMock);
    const { getProfileSessions, revokeProfileSession } = await import("./api");

    const result = await getProfileSessions("token-123");
    await revokeProfileSession("token-123", "hash");

    expect(result.active).toHaveLength(1);
    expect(result.stale).toHaveLength(0);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://app.dubgrid.com/api/mobile/v1/profile/sessions",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://app.dubgrid.com/api/mobile/v1/profile/sessions",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }),
    );
  });

  it("updates teammate status through the mobile people endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        person: {
          id: "00000000-0000-0000-0000-000000000001",
          employeeNumber: 1042,
          firstName: "Mina",
          lastName: "Diaz",
          phone: "555-0100",
          email: "mina@dubgrid.com",
          status: "inactive",
          focusAreaIds: [1, 2],
          contactNotes: "Weekend availability",
          statusChangedAt: "2026-04-24T12:00:00.000Z",
          statusNote: "Coverage hold",
          version: 8,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { updateMobilePersonStatus } = await import("./api");

    await updateMobilePersonStatus("token-123", "00000000-0000-0000-0000-000000000001", {
      action: "deactivate",
      expectedVersion: 7,
      note: "Coverage hold",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/people/00000000-0000-0000-0000-000000000001/status",
      expect.any(Object),
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("PATCH");
    expect(request.body).toBe(
      JSON.stringify({
        action: "deactivate",
        expectedVersion: 7,
        note: "Coverage hold",
      }),
    );
  });

  it("loads a single teammate through the mobile person endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        person: {
          id: "00000000-0000-0000-0000-000000000001",
          employeeNumber: 1042,
          firstName: "Mina",
          lastName: "Diaz",
          phone: "555-0100",
          email: "mina@dubgrid.com",
          status: "active",
          focusAreaIds: [1, 2],
          contactNotes: "Weekend availability",
          statusChangedAt: "2026-04-24T12:00:00.000Z",
          statusNote: "",
          version: 8,
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { getMobilePerson } = await import("./api");

    const result = await getMobilePerson("token-123", "00000000-0000-0000-0000-000000000001");

    expect(result.person.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.dubgrid.com/api/mobile/v1/people/00000000-0000-0000-0000-000000000001",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("manages teammate invitations through the mobile people endpoint", async () => {
    const person = {
      id: "00000000-0000-0000-0000-000000000001",
      employeeNumber: 1042,
      firstName: "Mina",
      lastName: "Diaz",
      phone: "555-0100",
      email: "mina@dubgrid.com",
      status: "active",
      focusAreaIds: [1],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          person: {
            ...person,
            pendingInvitation: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "mina@dubgrid.com",
              expiresAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-04-28T00:00:00.000Z",
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          person: {
            ...person,
            pendingInvitation: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "mina@dubgrid.com",
              expiresAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-04-28T01:00:00.000Z",
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, person }),
      });

    vi.stubGlobal("fetch", fetchMock);
    const {
      createMobilePersonInvitation,
      resendMobilePersonInvitation,
      revokeMobilePersonInvitation,
    } = await import("./api");

    await createMobilePersonInvitation("token-123", "00000000-0000-0000-0000-000000000001", {
      email: "mina@dubgrid.com",
    });
    await resendMobilePersonInvitation("token-123", "00000000-0000-0000-0000-000000000001", {
      invitationId: "11111111-1111-4111-8111-111111111111",
      expectedUpdatedAt: "2026-04-28T00:00:00.000Z",
    });
    await revokeMobilePersonInvitation("token-123", "00000000-0000-0000-0000-000000000001", {
      invitationId: "11111111-1111-4111-8111-111111111111",
      expectedUpdatedAt: "2026-04-28T01:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://app.dubgrid.com/api/mobile/v1/people/00000000-0000-0000-0000-000000000001/invitation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "mina@dubgrid.com" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://app.dubgrid.com/api/mobile/v1/people/00000000-0000-0000-0000-000000000001/invitation",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://app.dubgrid.com/api/mobile/v1/people/00000000-0000-0000-0000-000000000001/invitation",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("surfaces name mismatch details when linking an existing account from mobile", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        code: "NAME_MISMATCH",
        error: "The user account name does not match the employee record.",
        details: {
          employeeId: "00000000-0000-0000-0000-000000000001",
          userId: "22222222-2222-4222-8222-222222222222",
          employeeFirstName: "Mina",
          employeeLastName: "Diaz",
          accountFirstName: "Minnie",
          accountLastName: "Diaz",
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const { createMobilePersonInvitation, parseMobileNameMismatchError } = await import("./api");

    let thrownError: unknown;
    try {
      await createMobilePersonInvitation("token-123", "00000000-0000-0000-0000-000000000001", {
        email: "mina@dubgrid.com",
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain("The user account name does not match");
    expect(parseMobileNameMismatchError(thrownError)?.details).toMatchObject({
      accountFirstName: "Minnie",
      employeeFirstName: "Mina",
    });
  });

  it("parses account-found link challenges from mobile API errors", async () => {
    const { ApiResponseError } = await import("@dubgrid/api-client");
    const { parseMobileAccountLinkChallenge } = await import("./api");

    const challenge = parseMobileAccountLinkChallenge(
      new ApiResponseError("An existing account was found for this email.", 409, {
        code: "ACCOUNT_FOUND",
        details: {
          employeeId: "00000000-0000-0000-0000-000000000001",
          userId: "22222222-2222-4222-8222-222222222222",
          employeeFirstName: "Mina",
          employeeLastName: "Diaz",
          accountFirstName: "Mina",
          accountLastName: "Diaz",
        },
      }),
    );

    expect(challenge).toEqual({
      kind: "account_found",
      details: expect.objectContaining({
        accountFirstName: "Mina",
        employeeFirstName: "Mina",
      }),
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const requireMobileSensitiveActionAuth = vi.fn();
const fetchSelfProfileSnapshot = vi.fn();
const listOwnProfileChangeRequests = vi.fn();
const updateSelfProfileDetails = vi.fn();
const updateSelfLinkedEmployeePhone = vi.fn();
const updateSelfMfaStatus = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileFocusAreas = vi.fn();
const mapOrganizationToMobileConfig = vi.fn();
const fetchNotificationPreferences = vi.fn();
const saveNotificationPreferences = vi.fn();
const fetchUserSessionOverviewForUser = vi.fn();
const revokeUserSessionForUser = vi.fn();
const fetchMobileManagementMembershipRowsByUserIds = vi.fn();
const scheduleSecurityAlert = vi.fn();
const priorMfaProfile = vi.fn();

const serviceClient = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: () => priorMfaProfile() }) }),
  }),
};

vi.mock("@/features/account/server/security-alerts", () => ({
  scheduleSecurityAlert: (...args: unknown[]) => scheduleSecurityAlert(...args),
}));

vi.mock("@dubgrid/data-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dubgrid/data-access")>()),
  fetchMobileManagementMembershipRowsByUserIds,
}));

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  requireMobileSensitiveActionAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileFocusAreas,
  mapOrganizationToMobileConfig,
}));

vi.mock("@/features/account/server", () => ({
  fetchSelfProfileSnapshot,
  listOwnProfileChangeRequests,
  updateSelfProfileDetails,
  updateSelfLinkedEmployeePhone,
  updateSelfMfaStatus,
  fetchNotificationPreferences,
  saveNotificationPreferences,
  fetchUserSessionOverviewForUser,
  revokeUserSessionForUser,
}));

function mockAuth() {
  return {
    user: {
      id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      email: "manager@dubgrid.com",
      factors: [{ factor_type: "totp", status: "verified" }],
      created_at: "2024-01-01T00:00:00.000Z",
      last_sign_in_at: "2024-01-02T00:00:00.000Z",
      user_metadata: {
        first_name: "Mina",
        last_name: "Diaz",
      },
    },
    claims: {
      session_id: "77777777-7777-4777-8777-777777777777",
    },
    currentOrg: {
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      name: "DubGrid Health",
      slug: "dubgrid-health",
    },
    membership: {
      orgRole: "admin",
      adminPermissions: null,
    },
    permissions: {
      role: "admin",
      canManageEmployees: false,
    },
    serviceClient,
  };
}

describe("mobile profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue(mockAuth());
    requireMobileSensitiveActionAuth.mockResolvedValue(mockAuth());
    priorMfaProfile.mockResolvedValue({ data: { mfa_enabled: false }, error: null });
    fetchSelfProfileSnapshot.mockResolvedValue({
      firstName: "Mina",
      lastName: "Diaz",
      mfaEnabled: true,
      termsVersion: null,
    });
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: "d660d308-4e0d-4daf-84fd-6753405e6740",
      firstName: "Mina",
      lastName: "Diaz",
      employmentType: "full_time",
      status: "active",
      phone: "(415) 425-3334",
      email: "mina@example.com",
      certificationId: null,
      roleIds: [],
      focusAreaIds: [2],
      departmentIds: [],
      contactNotes: "",
      version: 4,
      employeeNumber: 42,
    });
    fetchMobileFocusAreas.mockResolvedValue([{ id: 2, name: "ICU" }]);
    fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([]);
    listOwnProfileChangeRequests.mockResolvedValue([]);
    mapOrganizationToMobileConfig.mockReturnValue({
      id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      name: "DubGrid Health",
      slug: "dubgrid-health",
      timezone: "America/Los_Angeles",
      shiftDisplayMode: "code",
      labels: {
        focusArea: "Focus Area",
        certification: "Certification",
        role: "Role",
        department: "Department",
      },
      featureFlags: {},
    });
  });

  it("returns the authenticated user's current-organization profile", async () => {
    const { GET } = await import("./profile");
    const response = await GET(new Request("http://localhost/api/mobile/v1/profile") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchLinkedEmployeeForUser).toHaveBeenCalledWith(
      serviceClient,
      "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
    );
    expect(payload).toMatchObject({
      user: {
        email: "manager@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
        mfaEnabled: true,
      },
      currentOrg: {
        name: "DubGrid Health",
      },
      currentMembership: {
        orgRole: "admin",
        isCurrent: true,
      },
      linkedEmployee: {
        focusAreaIds: [2],
        employeeNumber: 42,
      },
      focusAreas: [{ id: 2, name: "ICU" }],
      managementDepartmentIds: [],
      pendingProfileChangeRequest: false,
      pendingAccountDeletionRequest: false,
    });
  });

  // The profile screen says whether you are a management user, and the only
  // thing that decides that is the membership's own department list — an org
  // role says nothing about it.
  it("returns the caller's own management departments", async () => {
    fetchMobileManagementMembershipRowsByUserIds.mockResolvedValue([
      {
        user_id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        department_ids: [10, 11],
        dept_admin_ids: [],
        org_role: "admin",
        updated_at: null,
      },
      {
        user_id: "00000000-0000-4000-8000-000000000000",
        department_ids: [12],
        dept_admin_ids: [],
        org_role: "admin",
        updated_at: null,
      },
    ]);

    const { GET } = await import("./profile");
    const response = await GET(new Request("http://localhost/api/mobile/v1/profile") as never);
    const payload = await response.json();

    expect(fetchMobileManagementMembershipRowsByUserIds).toHaveBeenCalledWith(
      serviceClient,
      "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      ["8af6f242-c060-4920-a7db-91b4cb66fd26"],
    );
    expect(payload.managementDepartmentIds).toEqual([10, 11]);
  });

  it("returns pending profile change request state for the mobile profile", async () => {
    listOwnProfileChangeRequests.mockResolvedValue([
      {
        id: "04c24b87-7043-4e67-9d73-cb6a66b7cc5d",
        type: "profile_update",
        status: "pending",
      },
    ]);

    const { GET } = await import("./profile");
    const response = await GET(new Request("http://localhost/api/mobile/v1/profile") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pendingProfileChangeRequest).toBe(true);
  });

  it("returns pending account deletion request state for the mobile profile", async () => {
    listOwnProfileChangeRequests.mockResolvedValue([
      {
        id: "3f2a28ef-c34b-45d1-8990-81edbd32dfd4",
        type: "account_deletion",
        status: "pending",
      },
    ]);

    const { GET } = await import("./profile");
    const response = await GET(new Request("http://localhost/api/mobile/v1/profile") as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pendingAccountDeletionRequest).toBe(true);
  });

  it("blocks direct mobile account name updates", async () => {
    const { PATCHAccount } = await import("./profile");
    const response = await PATCHAccount(
      new Request("http://localhost/api/mobile/v1/profile/account", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: "Mina",
          lastName: "Diaz",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(updateSelfLinkedEmployeePhone).not.toHaveBeenCalled();
  });

  it("allows mobile users with employee management permission to update their own account name", async () => {
    requireMobileAuth.mockResolvedValue({
      ...mockAuth(),
      permissions: {
        role: "admin",
        canManageEmployees: true,
      },
    });
    updateSelfProfileDetails.mockResolvedValue({
      profile: {
        first_name: "Mina",
        last_name: "Rivera",
        mfa_enabled: true,
      },
      employee: null,
    });

    const { PATCHAccount } = await import("./profile");
    const response = await PATCHAccount(
      new Request("http://localhost/api/mobile/v1/profile/account", {
        method: "PATCH",
        body: JSON.stringify({
          firstName: "Mina",
          lastName: "Rivera",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(updateSelfProfileDetails).toHaveBeenCalledWith({
      userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      firstName: "Mina",
      lastName: "Rivera",
      orgId: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
    });
  });

  it("updates only the linked staff phone in the resolved current organization", async () => {
    updateSelfLinkedEmployeePhone.mockResolvedValue({
      employee: {
        id: "d660d308-4e0d-4daf-84fd-6753405e6740",
        firstName: "Mina",
        lastName: "Diaz",
        employmentType: "full_time",
        status: "active",
        phone: "(415) 555-0199",
        email: "mina@example.com",
        certificationId: null,
        roleIds: [],
        focusAreaIds: [2],
        departmentIds: [],
        contactNotes: "",
        version: 5,
      },
    });

    const { PATCHPhone } = await import("./profile");
    const response = await PATCHPhone(
      new Request("http://localhost/api/mobile/v1/profile/phone", {
        method: "PATCH",
        body: JSON.stringify({
          phone: "(415) 555-0199",
          expectedVersion: 4,
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(updateSelfLinkedEmployeePhone).toHaveBeenCalledWith({
      userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      userEmail: "manager@dubgrid.com",
      orgId: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      phone: "(415) 555-0199",
      expectedVersion: 4,
    });
  });

  it("rejects invalid phone update input", async () => {
    const { PATCHPhone } = await import("./profile");
    const response = await PATCHPhone(
      new Request("http://localhost/api/mobile/v1/profile/phone", {
        method: "PATCH",
        body: JSON.stringify({
          phone: "x".repeat(60),
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(updateSelfLinkedEmployeePhone).not.toHaveBeenCalled();
  });

  it("reconciles mfa_enabled from live Auth after a mobile enrollment completes", async () => {
    const { PATCHMfaStatus } = await import("./profile");
    const response = await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: JSON.stringify({}),
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith("8af6f242-c060-4920-a7db-91b4cb66fd26", true);
    expect(payload.user.mfaEnabled).toBe(true);
  });

  // Mobile enrollment used to change two-factor with no out-of-band alert.
  it("alerts out of band when two-factor changes from mobile", async () => {
    const { PATCHMfaStatus } = await import("./profile");
    await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: JSON.stringify({}),
      }) as never,
    );

    expect(scheduleSecurityAlert).toHaveBeenCalledWith("8af6f242-c060-4920-a7db-91b4cb66fd26", {
      action: "security_mfa_changed",
      orgId: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
      targetUserId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
      enabled: true,
    });
  });

  it("stays quiet when a mobile save repeats the current two-factor state", async () => {
    priorMfaProfile.mockResolvedValueOnce({ data: { mfa_enabled: true }, error: null });
    const { PATCHMfaStatus } = await import("./profile");
    await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: JSON.stringify({}),
      }) as never,
    );

    expect(scheduleSecurityAlert).not.toHaveBeenCalled();
  });

  it.each([
    { factors: undefined, enabled: false },
    { factors: [], enabled: false },
    { factors: [{ factor_type: "totp", status: "unverified" }], enabled: false },
    { factors: [{ factor_type: "totp", status: "verified" }], enabled: true },
    {
      factors: [
        { factor_type: "totp", status: "unverified" },
        { factor_type: "totp", status: "verified" },
      ],
      enabled: true,
    },
  ])("ignores a conflicting legacy client MFA flag: $enabled", async ({ factors, enabled }) => {
    const auth = mockAuth();
    requireMobileAuth.mockResolvedValueOnce({ ...auth, user: { ...auth.user, factors } });
    fetchSelfProfileSnapshot.mockResolvedValueOnce({ mfaEnabled: !enabled });
    const { PATCHMfaStatus } = await import("./profile");
    const response = await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled, userId: "another-user" }),
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(updateSelfMfaStatus).toHaveBeenCalledWith(auth.user.id, enabled);
    expect((await response.json()).user.mfaEnabled).toBe(enabled);
  });

  it.each([null, {}, [{ factor_type: "totp" }], [{ status: "verified" }]])(
    "does not overwrite status when live factors are malformed",
    async (factors) => {
      const auth = mockAuth();
      requireMobileAuth.mockResolvedValueOnce({ ...auth, user: { ...auth.user, factors } });
      const { PATCHMfaStatus } = await import("./profile");
      const response = await PATCHMfaStatus(
        new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
          method: "PATCH",
          body: "{}",
        }) as never,
      );
      expect(response.status).toBe(503);
      expect(updateSelfMfaStatus).not.toHaveBeenCalled();
      expect(fetchSelfProfileSnapshot).not.toHaveBeenCalled();
    },
  );

  it("preserves the mobile authentication boundary before reconciliation", async () => {
    requireMobileAuth.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    const { PATCHMfaStatus } = await import("./profile");
    const response = await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: "{}",
      }) as never,
    );
    expect(response.status).toBe(401);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
    expect(fetchSelfProfileSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an mfa-status update with a non-boolean body", async () => {
    const { PATCHMfaStatus } = await import("./profile");
    const response = await PATCHMfaStatus(
      new Request("http://localhost/api/mobile/v1/profile/mfa-status", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "yes" }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(updateSelfMfaStatus).not.toHaveBeenCalled();
  });
});

describe("mobile profile preference and session routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue(mockAuth());
  });

  it("loads user-scoped notification preferences with defaults", async () => {
    fetchNotificationPreferences.mockResolvedValue(null);

    const { GET } = await import("./profile-notification-preferences");
    const response = await GET(
      new Request("http://localhost/api/mobile/v1/profile/notification-preferences") as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchNotificationPreferences).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
    );
    expect(payload.prefs.schedule).toEqual({ in_app: true, email: false });
  });

  it("saves user-scoped notification preferences", async () => {
    const prefs = {
      schedule: { in_app: true, email: false },
      shift_requests: { in_app: false, email: true },
      system: { in_app: true, email: false },
    };
    saveNotificationPreferences.mockResolvedValue(prefs);

    const { PUT } = await import("./profile-notification-preferences");
    const response = await PUT(
      new Request("http://localhost/api/mobile/v1/profile/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ prefs }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(saveNotificationPreferences).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
      prefs,
    );
  });

  it("loads and revokes user-scoped sessions, marking the caller's own session current", async () => {
    fetchUserSessionOverviewForUser.mockResolvedValue({
      active: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          supabaseSessionId: "77777777-7777-4777-8777-777777777777",
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
        },
      ],
      stale: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          supabaseSessionId: "88888888-8888-4888-8888-888888888888",
          platform: "android",
          appVersion: null,
          deviceLabel: "DubGrid Mobile on Android",
          browserName: null,
          browserVersion: null,
          ipAddress: null,
          locationCity: null,
          locationCountry: null,
          lastActiveAt: "2024-01-02T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          refreshTokenHash: "other-hash",
        },
      ],
    });

    const { DELETE, GET } = await import("./profile-sessions");
    const getResponse = await GET(
      new Request("http://localhost/api/mobile/v1/profile/sessions") as never,
    );
    const getPayload = await getResponse.json();
    const deleteResponse = await DELETE(
      new Request("http://localhost/api/mobile/v1/profile/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }) as never,
    );

    expect(getResponse.status).toBe(200);
    expect(getPayload.active).toHaveLength(1);
    expect(getPayload.active[0].isCurrent).toBe(true);
    expect(getPayload.stale).toHaveLength(1);
    expect(getPayload.stale[0].isCurrent).toBe(false);
    expect(fetchUserSessionOverviewForUser).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
      { currentSupabaseSessionId: "77777777-7777-4777-8777-777777777777" },
    );
    expect(deleteResponse.status).toBe(200);
    expect(revokeUserSessionForUser).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
      "hash",
    );
    expect(requireMobileSensitiveActionAuth).toHaveBeenCalledTimes(1);
  });

  it("does not reach session revocation when recent identity proof is required", async () => {
    requireMobileSensitiveActionAuth.mockResolvedValue({
      response: Response.json(
        {
          code: "STEP_UP_REQUIRED",
          method: "totp",
          error: "Confirm your identity, then try again.",
        },
        { status: 403 },
      ),
    });
    const { DELETE } = await import("./profile-sessions");

    const response = await DELETE(
      new Request("http://localhost/api/mobile/v1/profile/sessions", {
        method: "DELETE",
        body: JSON.stringify({ refreshTokenHash: "hash" }),
      }) as never,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "STEP_UP_REQUIRED", method: "totp" });
    expect(revokeUserSessionForUser).not.toHaveBeenCalled();
  });
});

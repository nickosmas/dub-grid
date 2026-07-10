import { beforeEach, describe, expect, it, vi } from "vitest";

const requireMobileAuth = vi.fn();
const fetchSelfProfileSnapshot = vi.fn();
const listOwnProfileChangeRequests = vi.fn();
const updateSelfProfileDetails = vi.fn();
const updateSelfLinkedEmployeePhone = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const fetchMobileFocusAreas = vi.fn();
const mapOrganizationToMobileConfig = vi.fn();
const fetchNotificationPreferences = vi.fn();
const saveNotificationPreferences = vi.fn();
const fetchUserSessionOverviewForUser = vi.fn();
const revokeUserSessionForUser = vi.fn();

vi.mock("@/features/mobile/server", () => ({
  requireMobileAuth,
  fetchLinkedEmployeeForUser,
  fetchMobileFocusAreas,
  mapOrganizationToMobileConfig,
}));

vi.mock("@/features/account/server", () => ({
  fetchSelfProfileSnapshot,
  listOwnProfileChangeRequests,
  updateSelfProfileDetails,
  updateSelfLinkedEmployeePhone,
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
      created_at: "2024-01-01T00:00:00.000Z",
      last_sign_in_at: "2024-01-02T00:00:00.000Z",
      user_metadata: {
        first_name: "Mina",
        last_name: "Diaz",
      },
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
    serviceClient: {},
  };
}

describe("mobile profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMobileAuth.mockResolvedValue(mockAuth());
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
    });
    fetchMobileFocusAreas.mockResolvedValue([{ id: 2, name: "ICU" }]);
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
      {},
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
      },
      focusAreas: [{ id: 2, name: "ICU" }],
      pendingProfileChangeRequest: false,
      pendingAccountDeletionRequest: false,
    });
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

  it("loads and revokes user-scoped sessions", async () => {
    fetchUserSessionOverviewForUser.mockResolvedValue({
      active: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          supabaseSessionId: null,
          platform: "ios",
          appVersion: null,
          deviceLabel: "DubGrid Mobile on iOS",
          ipAddress: null,
          lastActiveAt: "2024-01-03T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          refreshTokenHash: "hash",
        },
      ],
      stale: [],
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
    expect(getPayload.stale).toHaveLength(0);
    expect(fetchUserSessionOverviewForUser).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
    );
    expect(deleteResponse.status).toBe(200);
    expect(revokeUserSessionForUser).toHaveBeenCalledWith(
      "8af6f242-c060-4920-a7db-91b4cb66fd26",
      "hash",
    );
  });
});

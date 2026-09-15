import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMobileOrganizationMembershipRows = vi.fn();
const fetchMobileOrganizationRowById = vi.fn();
const fetchMobileProfilePlatformRole = vi.fn();
const getServiceClient = vi.fn();
const createMobileUserClient = vi.fn();

vi.mock("@dubgrid/data-access", () => ({
  fetchMobileOrganizationMembershipRows,
  fetchMobileOrganizationRowById,
  fetchMobileProfilePlatformRole,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient,
}));

vi.mock("./client", () => ({
  createMobileUserClient,
}));

vi.mock("@/lib/db/mappers", () => ({
  rowToOrganization: (row: unknown) => row,
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: async () => true,
}));

// Claims now come from local JWKS verification rather than a Supabase Auth
// call. `getUser` is still mocked below because the MFA-factor check is the
// one thing that genuinely can't be answered from the token.
const verifyAccessToken = vi.fn();
const isSessionRevoked = vi.fn();

vi.mock("@/lib/auth/verify-token", () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
}));

vi.mock("@/lib/auth/revocation", () => ({
  isSessionRevoked: (...args: unknown[]) => isSessionRevoked(...args),
}));

const ORG_ID = "577a93d3-8f6a-4b45-a93d-b9731122ce11";
const USER_ID = "8af6f242-c060-4920-a7db-91b4cb66fd26";

function createSetupResult(data: unknown[], count?: number) {
  return { data, count: count ?? null, error: null };
}

function createThenableQuery(result: unknown, maybeSingleResult: unknown = result) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: Promise<unknown>["then"];
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(maybeSingleResult)),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return query;
}

function createServiceClient(input?: {
  setupComplete?: boolean;
  claims?: Record<string, unknown>;
  employeeStatus?: "active" | "inactive";
  factors?: Array<{
    id: string;
    factor_type: "totp";
    status: "verified" | "unverified";
  }>;
  omitFactors?: boolean;
}) {
  const setupComplete = input?.setupComplete ?? true;

  // Keep the locally verified claims in step with what this mock describes,
  // so call sites configure both through one place.
  verifyAccessToken.mockResolvedValue({
    userId: USER_ID,
    sessionId: "session-1",
    email: "manager@dubgrid.com",
    issuedAtMs: Date.now(),
    claims: {
      sub: USER_ID,
      org_id: ORG_ID,
      platform_role: "none",
      ...input?.claims,
    },
  });

  const setupResults: Record<string, unknown> = {
    focus_areas: createSetupResult(
      setupComplete ? [{ id: 1, department_id: 10, archived_at: null }] : [],
    ),
    shift_categories: createSetupResult(
      setupComplete ? [{ id: 2, focus_area_id: 1, archived_at: null }] : [],
    ),
    jobs: createSetupResult(
      setupComplete
        ? [
            {
              id: 3,
              assignment_mode: "with_shift",
              show_on_grid: true,
              focus_area_ids: [1],
              department_ids: [],
              applicable_shift_ids: [2],
              archived_at: null,
            },
          ]
        : [],
    ),
    certifications: createSetupResult(setupComplete ? [{ id: 4, archived_at: null }] : []),
    organization_roles: createSetupResult(setupComplete ? [{ id: 5, archived_at: null }] : []),
    departments: createSetupResult(
      setupComplete ? [{ id: 10, type: "scheduled", archived_at: null }] : [],
    ),
    employees: createSetupResult([], setupComplete ? 1 : 0),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: USER_ID,
            email: "manager@dubgrid.com",
            ...(input?.omitFactors ? {} : { factors: input?.factors ?? [] }),
            user_metadata: {},
          },
        },
        error: null,
      }),
      getClaims: vi.fn().mockResolvedValue({
        data: {
          claims: {
            org_id: ORG_ID,
            platform_role: "none",
            ...input?.claims,
          },
        },
        error: null,
      }),
    },
    from: vi.fn((table: string) =>
      createThenableQuery(
        setupResults[table],
        table === "employees"
          ? { data: { status: input?.employeeStatus ?? "active" }, error: null }
          : setupResults[table],
      ),
    ),
  };
}

describe("mobile auth server boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSessionRevoked.mockResolvedValue(false);
    fetchMobileOrganizationMembershipRows.mockResolvedValue([
      {
        user_id: USER_ID,
        org_role: "admin",
        admin_permissions: null,
        joined_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
        department_ids: [],
        dept_admin_ids: [],
        organization: {
          id: ORG_ID,
          name: "DubGrid Health",
          slug: "dubgrid-health",
        },
      },
    ]);
    fetchMobileOrganizationRowById.mockResolvedValue({
      id: ORG_ID,
      archivedAt: null,
      suspendedAt: null,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    fetchMobileProfilePlatformRole.mockResolvedValue("none");
    createMobileUserClient.mockReturnValue({});
  });

  it("blocks mobile app access while organization setup is incomplete", async () => {
    getServiceClient.mockReturnValue(createServiceClient({ setupComplete: false }));

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer access-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({
      error: "Organization unavailable. Please try again later.",
    });
  });

  it("rejects a revoked session even though the token still verifies", async () => {
    getServiceClient.mockReturnValue(createServiceClient({ setupComplete: true }));
    isSessionRevoked.mockResolvedValue(true);

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer access-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(401);
  });

  it("rejects a token that fails local verification", async () => {
    getServiceClient.mockReturnValue(createServiceClient({ setupComplete: true }));
    verifyAccessToken.mockResolvedValue(null);

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer access-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(401);
  });

  it.each(["user", "admin", "super_admin"])(
    "allows %s mobile auth context once organization setup is complete",
    async (orgRole) => {
      fetchMobileOrganizationMembershipRows.mockResolvedValue([
        {
          user_id: USER_ID,
          org_role: orgRole,
          admin_permissions: null,
          joined_at: "2026-01-01T00:00:00.000Z",
          updated_at: null,
          department_ids: [],
          dept_admin_ids: [],
          organization: {
            id: ORG_ID,
            name: "DubGrid Health",
            slug: "dubgrid-health",
          },
        },
      ]);
      getServiceClient.mockReturnValue(createServiceClient({ setupComplete: true }));

      const { requireMobileAuth } = await import("./auth");
      const result = await requireMobileAuth(
        new Request("http://localhost/api/mobile/v1/bootstrap", {
          headers: { authorization: "Bearer access-token" },
        }) as never,
      );

      expect("response" in result).toBe(false);
      if ("response" in result) return;
      expect(result.currentOrg.id).toBe(ORG_ID);
      expect(result.permissions.orgId).toBe(ORG_ID);
      expect(result.membership?.orgRole).toBe(orgRole);
    },
  );

  it("rejects a live Gridmaster account before resolving organization membership", async () => {
    fetchMobileProfilePlatformRole.mockResolvedValue("gridmaster");
    getServiceClient.mockReturnValue(
      createServiceClient({
        setupComplete: true,
        claims: { platform_role: "none" },
      }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer gridmaster-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({
      error: "Gridmaster mobile access is not supported",
    });
    expect(fetchMobileOrganizationMembershipRows).not.toHaveBeenCalled();
  });

  it("does not reject a regular account because of a stale Gridmaster claim", async () => {
    getServiceClient.mockReturnValue(
      createServiceClient({
        setupComplete: true,
        claims: { platform_role: "gridmaster" },
      }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer stale-gridmaster-token" },
      }) as never,
    );

    expect("response" in result).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-an-organization-id"],
  ])("rejects a %s organization claim without reading organization data", async (_label, orgId) => {
    getServiceClient.mockReturnValue(
      createServiceClient({ setupComplete: true, claims: { org_id: orgId } }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer invalid-org-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(403);
    expect(fetchMobileOrganizationRowById).not.toHaveBeenCalled();
  });

  it("rejects a removed or archived organization membership", async () => {
    fetchMobileOrganizationMembershipRows.mockResolvedValue([]);
    getServiceClient.mockReturnValue(createServiceClient({ setupComplete: true }));

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer removed-membership-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(403);
    expect(fetchMobileOrganizationRowById).not.toHaveBeenCalled();
  });

  it("rejects an archived organization", async () => {
    fetchMobileOrganizationRowById.mockResolvedValue({
      id: ORG_ID,
      archivedAt: "2026-09-10T00:00:00.000Z",
      suspendedAt: null,
      subscriptionStatus: "active",
      trialEndsAt: null,
    });
    getServiceClient.mockReturnValue(createServiceClient({ setupComplete: true }));

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer archived-org-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({
      error: "Organization unavailable. Please try again later.",
    });
  });

  it("keeps inactive employees authenticated without management capabilities", async () => {
    getServiceClient.mockReturnValue(
      createServiceClient({ setupComplete: true, employeeStatus: "inactive" }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer inactive-employee-token" },
      }) as never,
    );

    expect("response" in result).toBe(false);
    if ("response" in result) return;
    expect(result.permissions.canManageEmployees).toBe(false);
    expect(result.permissions.canEditShifts).toBe(false);
  });

  it("allows an aal1 mobile session when no verified TOTP factor exists", async () => {
    getServiceClient.mockReturnValue(
      createServiceClient({
        setupComplete: true,
        claims: { aal: "aal1" },
        factors: [],
      }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer password-only-token" },
      }) as never,
    );

    expect("response" in result).toBe(false);
    if ("response" in result) return;
    expect(result.currentOrg.id).toBe(ORG_ID);
  });

  it("blocks aal1 mobile sessions when a verified TOTP factor exists", async () => {
    getServiceClient.mockReturnValue(
      createServiceClient({
        setupComplete: true,
        claims: { aal: "aal1" },
        factors: [
          {
            id: "factor-123",
            factor_type: "totp",
            status: "verified",
          },
        ],
      }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer pending-token" },
      }) as never,
    );

    expect("response" in result).toBe(true);
    if (!("response" in result)) return;
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({
      error: "Two-factor authentication required",
    });
  });

  it("allows aal2 mobile sessions when a verified TOTP factor exists", async () => {
    getServiceClient.mockReturnValue(
      createServiceClient({
        setupComplete: true,
        claims: { aal: "aal2" },
        factors: [
          {
            id: "factor-123",
            factor_type: "totp",
            status: "verified",
          },
        ],
      }),
    );

    const { requireMobileAuth } = await import("./auth");
    const result = await requireMobileAuth(
      new Request("http://localhost/api/mobile/v1/bootstrap", {
        headers: { authorization: "Bearer verified-token" },
      }) as never,
    );

    expect("response" in result).toBe(false);
    if ("response" in result) return;
    expect(result.currentOrg.id).toBe(ORG_ID);
    expect(result.permissions.orgId).toBe(ORG_ID);
  });

  describe("sensitive-action assurance", () => {
    it("returns the shared step-up contract for stale bearer proof", async () => {
      getServiceClient.mockReturnValue(
        createServiceClient({
          claims: {
            aal: "aal1",
            amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 301 }],
          },
        }),
      );

      const { requireMobileSensitiveActionAuth } = await import("./auth");
      const result = await requireMobileSensitiveActionAuth(
        new Request("http://localhost/api/mobile/v1/profile/sessions", {
          headers: { authorization: "Bearer stale-token" },
        }) as never,
      );

      expect("response" in result).toBe(true);
      if (!("response" in result)) return;
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        code: "STEP_UP_REQUIRED",
        method: "password",
        error: "Confirm your identity, then try again.",
      });
    });

    it.each([
      {
        label: "password",
        factors: [],
        claims: {
          aal: "aal1",
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
      {
        label: "TOTP",
        factors: [{ id: "factor-123", factor_type: "totp", status: "verified" }] as const,
        claims: {
          aal: "aal2",
          amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
        },
      },
    ])(
      "accepts recent $label proof selected from live factor state",
      async ({ factors, claims }) => {
        getServiceClient.mockReturnValue(createServiceClient({ factors: [...factors], claims }));

        const { requireMobileSensitiveActionAuth } = await import("./auth");
        const result = await requireMobileSensitiveActionAuth(
          new Request("http://localhost/api/mobile/v1/profile/sessions", {
            headers: { authorization: "Bearer fresh-token" },
          }) as never,
        );

        expect("response" in result).toBe(false);
      },
    );

    it("ignores an untrusted requested method and requires TOTP from live factors", async () => {
      getServiceClient.mockReturnValue(
        createServiceClient({
          factors: [{ id: "factor-123", factor_type: "totp", status: "verified" }],
          claims: {
            aal: "aal1",
            amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
          },
        }),
      );

      const { requireMobileSensitiveActionAuth } = await import("./auth");
      const result = await requireMobileSensitiveActionAuth(
        new Request("http://localhost/api/mobile/v1/profile/sessions", {
          method: "DELETE",
          headers: {
            authorization: "Bearer aal1-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ method: "password" }),
        }) as never,
      );

      expect("response" in result).toBe(true);
      if (!("response" in result)) return;
      await expect(result.response.json()).resolves.toEqual({
        code: "STEP_UP_REQUIRED",
        method: "totp",
        error: "Confirm your identity, then try again.",
      });
    });

    it("accepts Supabase's omitted empty factors with fresh password proof", async () => {
      getServiceClient.mockReturnValue(
        createServiceClient({
          omitFactors: true,
          claims: {
            aal: "aal1",
            amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
          },
        }),
      );

      const { requireMobileSensitiveActionAuth } = await import("./auth");
      const result = await requireMobileSensitiveActionAuth(
        new Request("http://localhost/api/mobile/v1/profile/sessions", {
          headers: { authorization: "Bearer no-factor-state-token" },
        }) as never,
      );

      expect("response" in result).toBe(false);
    });
  });
});

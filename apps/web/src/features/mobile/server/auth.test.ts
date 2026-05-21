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

const ORG_ID = "577a93d3-8f6a-4b45-a93d-b9731122ce11";
const USER_ID = "8af6f242-c060-4920-a7db-91b4cb66fd26";

function createSetupResult(data: unknown[], count?: number) {
  return { data, count: count ?? null, error: null };
}

function createThenableQuery(result: unknown) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    then: Promise<unknown>["then"];
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => Promise.resolve(result)),
    then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };

  return query;
}

function createServiceClient(input?: {
  setupComplete?: boolean;
  claims?: Record<string, unknown>;
  factors?: Array<{
    id: string;
    factor_type: "totp";
    status: "verified";
  }>;
}) {
  const setupComplete = input?.setupComplete ?? true;
  const setupResults: Record<string, unknown> = {
    focus_areas: createSetupResult(
      setupComplete
        ? [{ id: 1, department_id: 10, archived_at: null }]
        : [],
    ),
    shift_categories: createSetupResult(
      setupComplete
        ? [{ id: 2, focus_area_id: 1, archived_at: null }]
        : [],
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
    certifications: createSetupResult(
      setupComplete ? [{ id: 4, archived_at: null }] : [],
    ),
    organization_roles: createSetupResult(
      setupComplete ? [{ id: 5, archived_at: null }] : [],
    ),
    departments: createSetupResult(
      setupComplete
        ? [{ id: 10, type: "scheduled", archived_at: null }]
        : [],
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
            factors: input?.factors ?? [],
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
    from: vi.fn((table: string) => createThenableQuery(setupResults[table])),
  };
}

describe("requireMobileAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      error: "Organization unavailable. Sign in on the web to finish organization setup.",
    });
  });

  it("allows mobile auth context once organization setup is complete", async () => {
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
});

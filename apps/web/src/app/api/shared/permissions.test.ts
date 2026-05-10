import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuthenticatedUser = vi.fn();
const createRequestSupabaseClient = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: (req: NextRequest) =>
    createRequestSupabaseClient(req),
  requireAuthenticatedUser: (req: NextRequest) => requireAuthenticatedUser(req),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => getServiceClient(),
}));

type MockAccessRow = {
  membership?: {
    org_role: string | null;
    admin_permissions: Record<string, boolean> | null;
  } | null;
  profile?: { platform_role: string | null } | null;
  organization?: {
    suspended_at: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
  } | null;
  setup?: Partial<MockSetupRows>;
};

type MockSetupRows = {
  focusAreas: Array<{
    id: number;
    department_id: number | null;
    archived_at: string | null;
  }>;
  shiftCategories: Array<{
    id: number;
    focus_area_id: number | null;
    archived_at: string | null;
  }>;
  jobs: Array<{
    id: number;
    assignment_mode: string;
    show_on_grid: boolean;
    focus_area_ids: number[];
    department_ids: number[];
    applicable_shift_ids: number[];
    archived_at: string | null;
  }>;
  certifications: Array<{ id: number; archived_at: string | null }>;
  orgRoles: Array<{ id: number; archived_at: string | null }>;
  departments: Array<{
    id: number;
    type: string;
    archived_at: string | null;
  }>;
  activeEmployeeCount: number;
};

const completeSetupRows: MockSetupRows = {
  departments: [{ id: 10, type: "scheduled", archived_at: null }],
  focusAreas: [{ id: 20, department_id: 10, archived_at: null }],
  shiftCategories: [{ id: 30, focus_area_id: 20, archived_at: null }],
  jobs: [
    {
      id: 40,
      assignment_mode: "with_shift",
      show_on_grid: true,
      focus_area_ids: [20],
      department_ids: [],
      applicable_shift_ids: [30],
      archived_at: null,
    },
  ],
  certifications: [{ id: 50, archived_at: null }],
  orgRoles: [{ id: 60, archived_at: null }],
  activeEmployeeCount: 1,
};

function createServiceClientMock(rows: MockAccessRow) {
  const setup: MockSetupRows = {
    ...completeSetupRows,
    ...(rows.setup ?? {}),
  };

  function getListData(table: string) {
    switch (table) {
      case "focus_areas":
        return setup.focusAreas;
      case "shift_categories":
        return setup.shiftCategories;
      case "jobs":
        return setup.jobs;
      case "certifications":
        return setup.certifications;
      case "organization_roles":
        return setup.orgRoles;
      case "departments":
        return setup.departments;
      case "employees":
        return null;
      default:
        return null;
    }
  }

  return {
    from(table: string) {
      return {
        select(_columns?: string, options?: { count?: string; head?: boolean }) {
          const query = {
            eq() {
              return query;
            },
            is() {
              return query;
            },
            maybeSingle: async () => ({
              data:
                table === "organization_memberships"
                  ? (rows.membership ?? null)
                  : table === "profiles"
                    ? (rows.profile ?? null)
                    : table === "organizations"
                      ? (rows.organization ?? null)
                      : null,
              error: null,
            }),
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?:
                | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
                | null,
              onrejected?:
                | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
                | null,
            ) {
              return Promise.resolve({
                data: getListData(table),
                error: null,
                count:
                  table === "employees" && options?.count === "exact"
                    ? setup.activeEmployeeCount
                    : null,
              }).then(onfulfilled, onrejected);
            },
          };
          return query;
        },
      };
    },
  };
}

function makeRequest() {
  return new NextRequest("http://localhost/api/schedule/manage");
}

describe("requireOrgPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "8af6f242-c060-4920-a7db-91b4cb66fd26" },
    });
    createRequestSupabaseClient.mockReturnValue({});
  });

  it("blocks regular users from org-scoped APIs when billing is locked", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "user", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "canceled",
          trial_ends_at: null,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      () => true,
    );

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error:
          "Workspace unavailable. Your workspace will be available once your organization administrator finishes setup.",
      });
    }
  });

  it("blocks regular admins from org-scoped APIs when billing is locked", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "canceled",
          trial_ends_at: null,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      () => true,
    );

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
    }
  });

  it("blocks super admins from operational org-scoped APIs when billing is locked", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "super_admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "canceled",
          trial_ends_at: null,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.isSuperAdmin,
    );

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
    }
  });

  it("keeps gridmasters available for locked organization recovery", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: null,
        profile: { platform_role: "gridmaster" },
        organization: {
          suspended_at: null,
          subscription_status: "canceled",
          trial_ends_at: null,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.isGridmaster,
    );

    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.permissions.isGridmaster).toBe(true);
    }
  });

  it("blocks operational org-scoped APIs while setup is incomplete", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        setup: {
          focusAreas: [],
          activeEmployeeCount: 0,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      () => true,
    );

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toEqual({
        error:
          "Workspace unavailable. Your workspace will be available once your organization administrator finishes setup.",
      });
    }
  });

  it("allows setup-required org APIs while setup is incomplete", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        setup: {
          focusAreas: [],
          activeEmployeeCount: 0,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      () => true,
      { allowDuringSetup: true },
    );

    expect("response" in result).toBe(false);
  });

  it("allows bootstrap recovery APIs while billing is locked", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "canceled",
          trial_ends_at: null,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      () => true,
      { allowDuringSetup: true, allowLockedWorkspace: true },
    );

    expect("response" in result).toBe(false);
  });

  it("keeps gridmasters available when organization setup is incomplete", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: null,
        profile: { platform_role: "gridmaster" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        setup: {
          focusAreas: [],
          activeEmployeeCount: 0,
        },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.isGridmaster,
    );

    expect("response" in result).toBe(false);
  });
});

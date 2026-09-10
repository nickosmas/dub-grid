import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuthenticatedUser = vi.fn();
const createRequestSupabaseClient = vi.fn();
const getServiceClient = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  createRequestSupabaseClient: (req: NextRequest) => createRequestSupabaseClient(req),
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
    archived_at?: string | null;
    suspended_at: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
  } | null;
  employee?: { status: string | null } | null;
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
                      : table === "employees"
                        ? (rows.employee ?? null)
                        : null,
              error: null,
            }),
            then<TResult1 = unknown, TResult2 = never>(
              onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
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

function makeRequest(method?: string) {
  return new NextRequest("http://localhost/api/schedule/manage", { method });
}

describe("requireOrgPermissions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Module-level memo, so it survives between cases in this file — a
    // previous test's "setup complete" would otherwise leak into the next.
    const { resetOrgSetupCompleteMemo } = await import("./permissions");
    resetOrgSetupCompleteMemo();
    requireAuthenticatedUser.mockResolvedValue({
      user: { id: "8af6f242-c060-4920-a7db-91b4cb66fd26" },
    });
    createRequestSupabaseClient.mockReturnValue({});
  });

  // ── Tenant isolation ──────────────────────────────────────────────────
  //
  // Authorization is answered by a live membership query, not by the JWT.
  // That matters more now that tokens are verified locally: a token can be up
  // to an hour old, so its org claims must never be the thing that grants
  // access. These lock that in.
  describe("tenant isolation", () => {
    const OTHER_ORG = "99999999-9999-4999-8999-999999999999";

    it("rejects a stale claimed org and cross-tenant requested org without a live membership", async () => {
      requireAuthenticatedUser.mockResolvedValue({
        user: {
          id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
          app_metadata: { org_id: "11111111-1111-4111-8111-111111111111" },
        },
      });
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: null,
          profile: { platform_role: "none" },
          organization: {
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
        }),
      );

      const { requireOrgPermissions } = await import("./permissions");
      const result = await requireOrgPermissions(makeRequest(), OTHER_ORG, () => true);

      expect("response" in result).toBe(true);
      if ("response" in result) {
        expect(result.response.status).toBe(403);
      }
    });

    it("rejects a removed membership even when the setup-complete cache is warm", async () => {
      const ORG = "11111111-1111-4111-8111-111111111111";
      const { requireOrgPermissions } = await import("./permissions");

      // A successful request warms the positive-only setup cache.
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: { org_role: "admin", admin_permissions: null },
          profile: { platform_role: "none" },
          organization: {
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
          employee: { status: "active" },
        }),
      );
      const allowed = await requireOrgPermissions(makeRequest(), ORG, () => true);
      expect("response" in allowed).toBe(false);

      // Membership is removed while the token and setup cache are stale. The
      // very next request must still fail before cached setup can matter.
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: null,
          profile: { platform_role: "none" },
          organization: {
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
          employee: { status: "active" },
        }),
      );
      const denied = await requireOrgPermissions(makeRequest(), ORG, () => true);

      expect("response" in denied).toBe(true);
      if ("response" in denied) {
        expect(denied.response.status).toBe(403);
      }
    });

    it("rejects a caller whose membership in the requested org is archived", async () => {
      // An archived membership doesn't come back from the query at all — the
      // lookup filters `archived_at is null` — so it reads as "no membership".
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: null,
          profile: { platform_role: "none" },
          organization: {
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
        }),
      );

      const { requireOrgPermissions } = await import("./permissions");
      const result = await requireOrgPermissions(makeRequest("POST"), OTHER_ORG, () => true);

      expect("response" in result).toBe(true);
      if ("response" in result) {
        expect(result.response.status).toBe(403);
      }
    });

    it("rejects a member of an archived organization even for recovery endpoints", async () => {
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: { org_role: "super_admin", admin_permissions: null },
          profile: { platform_role: "none" },
          organization: {
            archived_at: "2026-08-27T00:00:00.000Z",
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
        }),
      );

      const { requireOrgPermissions } = await import("./permissions");
      const result = await requireOrgPermissions(
        makeRequest(),
        "11111111-1111-4111-8111-111111111111",
        (permissions) => permissions.isSuperAdmin,
        { allowDuringSetup: true, allowLockedOrganization: true },
      );

      expect("response" in result).toBe(true);
      if ("response" in result) {
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toEqual({
          error: "This organization is no longer available.",
        });
      }
    });

    it("derives the caller's role from the membership row, not from a claim", async () => {
      // The membership row says "user"; nothing the caller could put in a
      // token changes that.
      getServiceClient.mockReturnValue(
        createServiceClientMock({
          membership: { org_role: "user", admin_permissions: null },
          profile: { platform_role: "none" },
          organization: {
            suspended_at: null,
            subscription_status: "active",
            trial_ends_at: null,
          },
          employee: { status: "active" },
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
          "Organization unavailable. Your organization opens up once your administrator finishes setup.",
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
          "Organization unavailable. Your organization opens up once your administrator finishes setup.",
      });
    }
  });

  it("never memoizes an incomplete setup, so finishing it takes effect at once", async () => {
    // The in-process memo in front of the Redis lookup holds only `true`, for
    // the same reason Redis does: incomplete -> complete is the transition an
    // admin is actively waiting on. Memoizing `false` would leave them staring
    // at a locked org after they finished setting it up.
    const ORG = "11111111-1111-4111-8111-111111111111";
    const access = {
      membership: { org_role: "admin", admin_permissions: null },
      profile: { platform_role: "none" },
      organization: {
        suspended_at: null,
        subscription_status: "active",
        trial_ends_at: null,
      },
    } as const;

    const { requireOrgPermissions } = await import("./permissions");

    getServiceClient.mockReturnValue(
      createServiceClientMock({ ...access, setup: { focusAreas: [], activeEmployeeCount: 0 } }),
    );
    const blocked = await requireOrgPermissions(makeRequest(), ORG, () => true);
    expect("response" in blocked).toBe(true);

    // Same org, setup now finished — must be seen on the very next request.
    getServiceClient.mockReturnValue(createServiceClientMock({ ...access }));
    const allowed = await requireOrgPermissions(makeRequest(), ORG, () => true);
    expect("response" in allowed).toBe(false);
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
      { allowDuringSetup: true, allowLockedOrganization: true },
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

  it("strips an inactive admin's manage capability even though admin_permissions grants it", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        employee: { status: "inactive" },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.canManageEmployees,
    );

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
    }
  });

  it("leaves an active admin's manage capability intact", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "admin", admin_permissions: { canManageEmployees: true } },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        employee: { status: "active" },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.canManageEmployees,
    );

    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.permissions.canManageEmployees).toBe(true);
      expect(result.permissions.isInactive).toBe(false);
    }
  });

  it("does not strip a super_admin's permissions even if their employees row is inactive", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: { org_role: "super_admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        employee: { status: "inactive" },
      }),
    );

    const { requireOrgPermissions } = await import("./permissions");
    const result = await requireOrgPermissions(
      makeRequest(),
      "11111111-1111-4111-8111-111111111111",
      (permissions) => permissions.isSuperAdmin,
    );

    expect("response" in result).toBe(false);
    if (!("response" in result)) {
      expect(result.permissions.isSuperAdmin).toBe(true);
      expect(result.permissions.isInactive).toBe(false);
    }
  });

  it("does not strip a gridmaster's permissions even if they have a stale inactive employees row", async () => {
    getServiceClient.mockReturnValue(
      createServiceClientMock({
        membership: null,
        profile: { platform_role: "gridmaster" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
        employee: { status: "inactive" },
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
      expect(result.permissions.isInactive).toBe(false);
    }
  });

  describe("ignoreSandbox misuse guard", () => {
    function baseRows() {
      return createServiceClientMock({
        membership: { org_role: "super_admin", admin_permissions: null },
        profile: { platform_role: "none" },
        organization: {
          suspended_at: null,
          subscription_status: "active",
          trial_ends_at: null,
        },
      });
    }

    it("allows ignoreSandbox on a GET request", async () => {
      getServiceClient.mockReturnValue(baseRows());

      const { requireOrgPermissions } = await import("./permissions");
      const result = await requireOrgPermissions(
        makeRequest("GET"),
        "11111111-1111-4111-8111-111111111111",
        () => true,
        { ignoreSandbox: true },
      );

      expect("response" in result).toBe(false);
    });

    it("throws if ignoreSandbox is combined with a mutating request method", async () => {
      getServiceClient.mockReturnValue(baseRows());

      const { requireOrgPermissions } = await import("./permissions");

      // This must fail loudly rather than silently letting a sandboxed
      // caller's write reach their real org — ignoreSandbox is meant for
      // read-only endpoints (e.g. billing) only.
      await expect(
        requireOrgPermissions(
          makeRequest("POST"),
          "11111111-1111-4111-8111-111111111111",
          () => true,
          { ignoreSandbox: true },
        ),
      ).rejects.toThrow(/ignoreSandbox must not be used with POST/);
    });
  });
});

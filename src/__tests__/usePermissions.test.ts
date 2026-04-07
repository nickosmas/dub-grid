import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mock jose (must be before import) ────────────────────────────────────────
const mockDecodeJwt = vi.fn();
vi.mock("jose", () => ({
  decodeJwt: (...args: unknown[]) => mockDecodeJwt(...args),
}));

// ── Mock impersonation ───────────────────────────────────────────────────────
const mockGetImpersonation = vi.fn().mockReturnValue(null);
vi.mock("@/lib/impersonation", () => ({
  getImpersonationFromCookie: (...args: unknown[]) => mockGetImpersonation(...args),
}));

// ── Mock supabase ────────────────────────────────────────────────────────────
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => mockSupabaseFrom(table),
  },
}));

// ── Import after mocks ──────────────────────────────────────────────────────
import {
  getPermissionsFromSession,
  clearPermsCache,
  usePermissions,
  ROLE_LEVEL,
  unionPermissions,
  applyViewImplications,
  READ_ONLY_PERMS,
  buildPerms,
} from "@/hooks/usePermissions";
import { ALL_FALSE_PERMS } from "./factories";

beforeEach(() => {
  vi.clearAllMocks();
  clearPermsCache();
  mockGetImpersonation.mockReturnValue(null);
});

// ══════════════════════════════════════════════════════════════════════════════
// Part A: ROLE_LEVEL constant
// ══════════════════════════════════════════════════════════════════════════════

describe("ROLE_LEVEL", () => {
  it("has correct hierarchy values", () => {
    expect(ROLE_LEVEL.gridmaster).toBe(4);
    expect(ROLE_LEVEL.super_admin).toBe(3);
    expect(ROLE_LEVEL.admin).toBe(2);
    expect(ROLE_LEVEL.user).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part B: getPermissionsFromSession (pure function)
// ══════════════════════════════════════════════════════════════════════════════

describe("getPermissionsFromSession", () => {
  it("returns NO_PERMS for null session", () => {
    const perms = getPermissionsFromSession(null);
    expect(perms.role).toBe("user");
    expect(perms.orgId).toBeNull();
    expect(perms.isLoading).toBe(false);
    expect(perms.isGridmaster).toBe(false);
  });

  it("returns NO_PERMS for session with no access_token", () => {
    const perms = getPermissionsFromSession({ access_token: "" } as Parameters<typeof getPermissionsFromSession>[0]);
    expect(perms.role).toBe("user");
  });

  it("returns gridmaster perms for gridmaster JWT", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "gridmaster",
      org_role: "user",
      org_id: null,
    });
    const session = { access_token: "fake-jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("gridmaster");
    expect(perms.isGridmaster).toBe(true);
    expect(perms.level).toBe(4);
    expect(perms.canEditShifts).toBe(true);
    expect(perms.canManageEmployees).toBe(true);
    expect(perms.canManageOrg).toBe(true);
  });

  it("returns super_admin perms for super_admin JWT", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const session = { access_token: "fake-jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("super_admin");
    expect(perms.isSuperAdmin).toBe(true);
    expect(perms.level).toBe(3);
    expect(perms.canEditShifts).toBe(true);
    expect(perms.canManageUsers).toBe(true);
  });

  it("returns read-only perms for admin JWT (no admin_permissions from JWT alone)", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const session = { access_token: "fake-jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("admin");
    expect(perms.level).toBe(2);
    // Without admin_permissions from DB, falls back to READ_ONLY
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canViewSchedule).toBe(true);
    expect(perms.canViewStaff).toBe(true);
  });

  it("returns read-only perms for user JWT", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    const session = { access_token: "fake-jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("user");
    expect(perms.level).toBe(0);
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canViewSchedule).toBe(true);
  });

  it("returns user perms when JWT decode fails", () => {
    mockDecodeJwt.mockImplementation(() => { throw new Error("bad jwt"); });
    const session = { access_token: "bad-jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("user");
    expect(perms.orgId).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part C: Permission derivation tests (via getPermissionsFromSession)
// ══════════════════════════════════════════════════════════════════════════════

describe("permission derivation", () => {
  it("atLeast works correctly for admin", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const session = { access_token: "jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.atLeast("user")).toBe(true);
    expect(perms.atLeast("admin")).toBe(true);
    expect(perms.atLeast("super_admin")).toBe(false);
    expect(perms.atLeast("gridmaster")).toBe(false);
  });

  it("canManageUsers is false for admin role", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const session = { access_token: "jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canConfigureAdminPermissions).toBe(false);
  });

  it("canManageUsers is true for super_admin", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const session = { access_token: "jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canConfigureAdminPermissions).toBe(true);
  });

  it("canManageOrg is true for super_admin", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const session = { access_token: "jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageOrg).toBe(true);
  });

  it("canManageOrg is false for user role", () => {
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    const session = { access_token: "jwt", user: { id: "u-1" } } as Parameters<typeof getPermissionsFromSession>[0];
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageOrg).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part D: usePermissions hook
// ══════════════════════════════════════════════════════════════════════════════

describe("usePermissions hook", () => {
  it("starts with loading state", () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isLoading).toBe(true);
  });

  it("resolves gridmaster perms from session", async () => {
    const session = { access_token: "jwt", user: { id: "gm-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockDecodeJwt.mockReturnValue({
      platform_role: "gridmaster",
      org_role: "user",
      org_id: null,
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("gridmaster");
    expect(result.current.isGridmaster).toBe(true);
    expect(result.current.canEditShifts).toBe(true);
  });

  it("resolves admin perms with DB admin_permissions fetch", async () => {
    const session = { access_token: "jwt", user: { id: "u-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    // Mock DB query for admin permissions
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                org_role: "admin",
                admin_permissions: {
                  canViewSchedule: true,
                  canEditShifts: true,
                  canPublishSchedule: false,
                  canApplyRecurringSchedule: false,
                  canEditNotes: true,
                  canManageRecurringShifts: false,
                  canManageShiftSeries: false,
                  canViewStaff: true,
                  canManageEmployees: false,
                  canManageFocusAreas: false,
                  canManageShiftCodes: false,
                  canManageIndicatorTypes: false,
                  canManageOrgSettings: false,
                  canManageOrgLabels: false,
                  canManageCoverageRequirements: false,
                  canApproveShiftRequests: false,
                },
              },
            }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("admin");
    expect(result.current.canEditShifts).toBe(true);
    expect(result.current.canEditNotes).toBe(true);
    expect(result.current.canPublishSchedule).toBe(false);
  });

  it("clears perms on SIGNED_OUT event", async () => {
    const session = { access_token: "jwt", user: { id: "u-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("super_admin");

    // Simulate SIGNED_OUT auth state change
    const authCallback = mockOnAuthStateChange.mock.calls[0][0];
    act(() => {
      authCallback("SIGNED_OUT", null);
    });

    await waitFor(() => expect(result.current.role).toBe("user"));
  });

  it("resolves user role correctly", async () => {
    const session = { access_token: "jwt", user: { id: "u-1" } };
    mockGetSession.mockResolvedValue({ data: { session } });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    // The user path queries profiles first, then organization_memberships.
    // profiles: .from("profiles").select(...).eq("id", userId).single()
    // memberships: .from("organization_memberships").select(...).eq("user_id", ...).eq("org_id", ...).single()
    let callCount = 0;
    mockSupabaseFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // profiles query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { org_id: "org-1", platform_role: "none" },
              }),
            }),
          }),
        };
      }
      // organization_memberships query (double eq chain)
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { org_role: "user", admin_permissions: null },
              }),
            }),
          }),
        }),
      };
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("user");
    expect(result.current.canEditShifts).toBe(false);
    expect(result.current.canViewSchedule).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part E: unionPermissions
// ══════════════════════════════════════════════════════════════════════════════

describe("unionPermissions", () => {
  it("returns READ_ONLY_PERMS baseline for empty input", () => {
    const result = unionPermissions([]);
    expect(result).toEqual({ ...READ_ONLY_PERMS, canManageOrgSettings: false });
  });

  it("returns the single permission set when given one input", () => {
    const perms = { ...ALL_FALSE_PERMS, canEditShifts: true, canManageEmployees: true };
    const result = unionPermissions([perms]);
    expect(result.canEditShifts).toBe(true);
    expect(result.canManageEmployees).toBe(true);
    expect(result.canPublishSchedule).toBe(false);
  });

  it("unions multiple permission sets (most permissive wins)", () => {
    const deptA = { ...ALL_FALSE_PERMS, canEditShifts: true, canEditNotes: true };
    const deptB = { ...ALL_FALSE_PERMS, canManageEmployees: true, canEditNotes: true };
    const result = unionPermissions([deptA, deptB]);

    expect(result.canEditShifts).toBe(true);
    expect(result.canManageEmployees).toBe(true);
    expect(result.canEditNotes).toBe(true);
    expect(result.canPublishSchedule).toBe(false);
  });

  it("always blocks canManageOrgSettings regardless of input", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageOrgSettings: true };
    const result = unionPermissions([perms]);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("preserves canViewSchedule and canViewStaff from READ_ONLY baseline", () => {
    const result = unionPermissions([ALL_FALSE_PERMS]);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
  });

  it("handles three departments with disjoint permissions", () => {
    const deptA = { ...ALL_FALSE_PERMS, canEditShifts: true };
    const deptB = { ...ALL_FALSE_PERMS, canManageFocusAreas: true };
    const deptC = { ...ALL_FALSE_PERMS, canApproveShiftRequests: true };
    const result = unionPermissions([deptA, deptB, deptC]);

    expect(result.canEditShifts).toBe(true);
    expect(result.canManageFocusAreas).toBe(true);
    expect(result.canApproveShiftRequests).toBe(true);
    expect(result.canManageOrgSettings).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part F: applyViewImplications
// ══════════════════════════════════════════════════════════════════════════════

describe("applyViewImplications", () => {
  it("canManageEmployees implies canViewEmployeeDetails", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageEmployees: true };
    const result = applyViewImplications(perms);
    expect(result.canViewEmployeeDetails).toBe(true);
    expect(result.canManageEmployees).toBe(true);
  });

  it("canManageFocusAreas implies canViewFocusAreas", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageFocusAreas: true };
    const result = applyViewImplications(perms);
    expect(result.canViewFocusAreas).toBe(true);
  });

  it("canManageShiftCodes implies canViewShiftCodes", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageShiftCodes: true };
    const result = applyViewImplications(perms);
    expect(result.canViewShiftCodes).toBe(true);
  });

  it("canManageIndicatorTypes implies canViewIndicatorTypes", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageIndicatorTypes: true };
    const result = applyViewImplications(perms);
    expect(result.canViewIndicatorTypes).toBe(true);
  });

  it("canManageCoverageRequirements implies canViewCoverageRequirements", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageCoverageRequirements: true };
    const result = applyViewImplications(perms);
    expect(result.canViewCoverageRequirements).toBe(true);
  });

  it("canManageRecurringShifts implies canViewRecurringShifts", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageRecurringShifts: true };
    const result = applyViewImplications(perms);
    expect(result.canViewRecurringShifts).toBe(true);
  });

  it("canManageOrgLabels implies canViewOrgLabels", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageOrgLabels: true };
    const result = applyViewImplications(perms);
    expect(result.canViewOrgLabels).toBe(true);
  });

  it("does not set canView when canManage is false", () => {
    const result = applyViewImplications(ALL_FALSE_PERMS);
    expect(result.canViewEmployeeDetails).toBe(false);
    expect(result.canViewFocusAreas).toBe(false);
    expect(result.canViewShiftCodes).toBe(false);
    expect(result.canViewIndicatorTypes).toBe(false);
    expect(result.canViewCoverageRequirements).toBe(false);
    expect(result.canViewRecurringShifts).toBe(false);
    expect(result.canViewOrgLabels).toBe(false);
    expect(result.canViewDashboardAnalytics).toBe(false);
  });

  it("preserves explicit canView when canManage is false (view-only mode)", () => {
    const perms = { ...ALL_FALSE_PERMS, canViewFocusAreas: true, canManageFocusAreas: false };
    const result = applyViewImplications(perms);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canManageFocusAreas).toBe(false);
  });

  it("sets canViewDashboardAnalytics when any edit permission is true", () => {
    const perms1 = { ...ALL_FALSE_PERMS, canEditShifts: true };
    expect(applyViewImplications(perms1).canViewDashboardAnalytics).toBe(true);

    const perms2 = { ...ALL_FALSE_PERMS, canManageEmployees: true };
    expect(applyViewImplications(perms2).canViewDashboardAnalytics).toBe(true);

    const perms3 = { ...ALL_FALSE_PERMS, canPublishSchedule: true };
    expect(applyViewImplications(perms3).canViewDashboardAnalytics).toBe(true);

    const perms4 = { ...ALL_FALSE_PERMS, canApproveShiftRequests: true };
    expect(applyViewImplications(perms4).canViewDashboardAnalytics).toBe(true);
  });

  it("backward compat: admin with old-style permissions gets view implied", () => {
    // Simulates an admin whose JSONB has manage perms but no view keys
    const oldStylePerms = {
      ...ALL_FALSE_PERMS,
      canManageEmployees: true,
      canManageFocusAreas: true,
      canManageShiftCodes: true,
      // canViewEmployeeDetails, canViewFocusAreas, canViewShiftCodes are false (not in JSONB)
    };
    const result = applyViewImplications(oldStylePerms);
    expect(result.canViewEmployeeDetails).toBe(true);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canViewShiftCodes).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part G: canAccessSettings
// ══════════════════════════════════════════════════════════════════════════════

describe("canAccessSettings", () => {
  it("is true for super_admin", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
      org_slug: "acme",
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccessSettings).toBe(true);
  });

  it("is true for admin with view-only permissions", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok", user: { id: "user-1" } } },
      error: null,
    });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
      org_slug: "acme",
    });
    mockSupabaseFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => ({
              data: {
                org_role: "admin",
                admin_permissions: {
                  ...ALL_FALSE_PERMS,
                  canViewFocusAreas: true,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccessSettings).toBe(true);
    expect(result.current.canManageOrg).toBe(false);
  });

  it("is false for user with no view or manage permissions", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
    mockDecodeJwt.mockReturnValue({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
      org_slug: "acme",
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccessSettings).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part H: unionPermissions with view permissions
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// Part H: buildPerms — user role with direct + department permissions
// ══════════════════════════════════════════════════════════════════════════════

describe("buildPerms — user role direct permissions", () => {
  it("user with direct perms only (no department perms)", () => {
    const directPerms = { ...ALL_FALSE_PERMS, canViewDashboardAnalytics: true, canViewEmployeeDetails: true };
    const result = buildPerms("user", "org-1", false, directPerms, false, null);
    expect(result.canViewDashboardAnalytics).toBe(true);
    expect(result.canViewEmployeeDetails).toBe(true);
    expect(result.canEditShifts).toBe(false);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with department perms only (no direct perms) — no regression", () => {
    const deptPerms = { ...ALL_FALSE_PERMS, canEditShifts: true, canEditNotes: true };
    const result = buildPerms("user", "org-1", false, null, false, deptPerms);
    expect(result.canEditShifts).toBe(true);
    expect(result.canEditNotes).toBe(true);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with both direct + department perms — union (most permissive wins)", () => {
    const directPerms = { ...ALL_FALSE_PERMS, canViewDashboardAnalytics: true, canViewFocusAreas: true };
    const deptPerms = { ...ALL_FALSE_PERMS, canEditShifts: true, canViewShiftCodes: true };
    const result = buildPerms("user", "org-1", false, directPerms, false, deptPerms);
    expect(result.canViewDashboardAnalytics).toBe(true);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canEditShifts).toBe(true);
    expect(result.canViewShiftCodes).toBe(true);
    expect(result.canPublishSchedule).toBe(false);
  });

  it("user with both — conflicting values resolve to most permissive", () => {
    const directPerms = { ...ALL_FALSE_PERMS, canEditShifts: false };
    const deptPerms = { ...ALL_FALSE_PERMS, canEditShifts: true };
    const result = buildPerms("user", "org-1", false, directPerms, false, deptPerms);
    expect(result.canEditShifts).toBe(true);
  });

  it("user with both — canManageOrgSettings forced false even if set true", () => {
    const directPerms = { ...ALL_FALSE_PERMS, canManageOrgSettings: true };
    const deptPerms = { ...ALL_FALSE_PERMS, canManageOrgSettings: true };
    const result = buildPerms("user", "org-1", false, directPerms, false, deptPerms);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with no direct or department perms gets READ_ONLY_PERMS", () => {
    const result = buildPerms("user", "org-1", false, null, false, null);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canEditShifts).toBe(false);
    expect(result.canViewDashboardAnalytics).toBe(false);
    expect(result.canAccessSettings).toBe(false);
  });

  it("user with direct view perms gets canAccessSettings", () => {
    const directPerms = { ...ALL_FALSE_PERMS, canViewFocusAreas: true };
    const result = buildPerms("user", "org-1", false, directPerms, false, null);
    expect(result.canAccessSettings).toBe(true);
    expect(result.canManageOrg).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part I: unionPermissions with view permissions
// ══════════════════════════════════════════════════════════════════════════════

describe("unionPermissions with view permissions", () => {
  it("unions canView permissions from multiple departments", () => {
    const deptA = { ...ALL_FALSE_PERMS, canViewFocusAreas: true };
    const deptB = { ...ALL_FALSE_PERMS, canViewShiftCodes: true };
    const result = unionPermissions([deptA, deptB]);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canViewShiftCodes).toBe(true);
    expect(result.canManageFocusAreas).toBe(false);
    expect(result.canManageShiftCodes).toBe(false);
  });

  it("preserves view permissions alongside manage permissions", () => {
    const deptA = { ...ALL_FALSE_PERMS, canViewFocusAreas: true };
    const deptB = { ...ALL_FALSE_PERMS, canManageFocusAreas: true };
    const result = unionPermissions([deptA, deptB]);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canManageFocusAreas).toBe(true);
  });
});

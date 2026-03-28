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
} from "@/hooks/usePermissions";

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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";

// ── Controlled mock for useAuth ─────────────────────────────────────────────
type MockAuth = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
};

let currentAuth: MockAuth = { user: null, session: null, isLoading: false };

function setAuth(next: Partial<MockAuth>): void {
  currentAuth = { ...currentAuth, ...next };
}

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => currentAuth,
}));

// ── Mock account client adapter (only the pieces usePermissions still uses) ──
const mockFetchAccountPermissions = vi.fn();
const mockRemoveBrowserRealtimeChannel = vi.fn();

function createMockChannel() {
  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return channel;
}

const mockCreateBrowserRealtimeChannel = vi.fn((_name: string) => createMockChannel());

vi.mock("@/features/account/client", () => ({
  createBrowserRealtimeChannel: (name: string) => mockCreateBrowserRealtimeChannel(name),
  fetchAccountPermissions: () => mockFetchAccountPermissions(),
  removeBrowserRealtimeChannel: (channel: unknown) => mockRemoveBrowserRealtimeChannel(channel),
}));

// ── Import after mocks ──────────────────────────────────────────────────────
import {
  getPermissionsFromSession,
  buildPerms,
  ROLE_LEVEL,
  unionPermissions,
  applyViewImplications,
  READ_ONLY_PERMS,
} from "@/features/permissions";
import { clearPermsCache, usePermissions } from "@/features/permissions/client";
import { ALL_FALSE_PERMS } from "./factories";

type TestJwtClaims = {
  platform_role?: string;
  org_role?: string;
  org_id?: string | null;
  org_slug?: string;
};

function encodeJwtPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createAccessToken(claims: TestJwtClaims): string {
  return `${encodeJwtPart({ alg: "none", typ: "JWT" })}.${encodeJwtPart(claims)}.signature`;
}

function createSession(
  claims: TestJwtClaims,
  userId = "u-1",
): Parameters<typeof getPermissionsFromSession>[0] {
  return {
    access_token: createAccessToken(claims),
    user: { id: userId },
  } as Parameters<typeof getPermissionsFromSession>[0];
}

function signIn(claims: TestJwtClaims, userId = "u-1") {
  const session = createSession(claims, userId) as unknown as Session;
  setAuth({
    user: { id: userId } as User,
    session,
    isLoading: false,
  });
  return session;
}

function signOut() {
  setAuth({ user: null, session: null, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPermsCache();
  currentAuth = { user: null, session: null, isLoading: false };
  mockFetchAccountPermissions.mockImplementation(async () => ({
    permissions: getPermissionsFromSession(currentAuth.session),
  }));
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
    const perms = getPermissionsFromSession({ access_token: "" } as Parameters<
      typeof getPermissionsFromSession
    >[0]);
    expect(perms.role).toBe("user");
  });

  it("returns gridmaster perms for gridmaster JWT", () => {
    const session = createSession({
      platform_role: "gridmaster",
      org_role: "user",
      org_id: null,
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("gridmaster");
    expect(perms.isGridmaster).toBe(true);
    expect(perms.level).toBe(4);
    expect(perms.canEditShifts).toBe(true);
    expect(perms.canManageEmployees).toBe(true);
    expect(perms.canManageOrg).toBe(true);
  });

  it("returns super_admin perms for super_admin JWT", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("super_admin");
    expect(perms.isSuperAdmin).toBe(true);
    expect(perms.level).toBe(3);
    expect(perms.canEditShifts).toBe(true);
    expect(perms.canManageUsers).toBe(true);
  });

  it("returns read-only perms for admin JWT (no admin_permissions from JWT alone)", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("admin");
    expect(perms.level).toBe(2);
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canViewSchedule).toBe(true);
    expect(perms.canViewStaff).toBe(true);
  });

  it("returns read-only perms for user JWT", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.role).toBe("user");
    expect(perms.level).toBe(0);
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canViewSchedule).toBe(true);
  });

  it("returns user perms when JWT decode fails", () => {
    const session = { access_token: "bad-jwt", user: { id: "u-1" } } as Parameters<
      typeof getPermissionsFromSession
    >[0];
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
    const session = createSession({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.atLeast("user")).toBe(true);
    expect(perms.atLeast("admin")).toBe(true);
    expect(perms.atLeast("super_admin")).toBe(false);
    expect(perms.atLeast("gridmaster")).toBe(false);
  });

  it("canManageUsers is false for admin role", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canConfigureAdminPermissions).toBe(false);
  });

  it("canManageUsers is true for super_admin", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageUsers).toBe(true);
    expect(perms.canConfigureAdminPermissions).toBe(true);
  });

  it("canManageOrg is true for super_admin", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageOrg).toBe(true);
  });

  it("canManageOrg is false for user role", () => {
    const session = createSession({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    const perms = getPermissionsFromSession(session);
    expect(perms.canManageOrg).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part D: usePermissions hook (consumes useAuth)
// ══════════════════════════════════════════════════════════════════════════════

describe("usePermissions hook", () => {
  it("starts with loading state when auth is still resolving", () => {
    setAuth({ user: null, session: null, isLoading: true });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isLoading).toBe(true);
  });

  it("returns NO_PERMS when auth resolves with no session", async () => {
    setAuth({ user: null, session: null, isLoading: false });
    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("user");
    expect(result.current.orgId).toBeNull();
  });

  it("resolves gridmaster perms from session", async () => {
    signIn(
      {
        platform_role: "gridmaster",
        org_role: "user",
        org_id: null,
      },
      "gm-1",
    );

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("gridmaster");
    expect(result.current.isGridmaster).toBe(true);
    expect(result.current.canEditShifts).toBe(true);
  });

  it("resolves admin perms from the account permissions adapter", async () => {
    signIn({
      platform_role: "none",
      org_role: "admin",
      org_id: "org-1",
    });
    mockFetchAccountPermissions.mockResolvedValue({
      permissions: buildPerms("admin", "org-1", false, {
        canViewSchedule: true,
        canEditShifts: true,
        canPublishSchedule: false,
        canApplyRecurringSchedule: false,
        canEditNotes: true,
        canEditScheduleIndicators: false,
        canViewRecurringShifts: false,
        canManageRecurringShifts: false,
        canManageShiftSeries: false,
        canViewStaff: true,
        canViewEmployeeDetails: false,
        canManageEmployees: false,
        canViewFocusAreas: false,
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
        canApproveShiftRequests: false,
        canViewDashboardAnalytics: false,
      }),
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("admin");
    expect(result.current.canEditShifts).toBe(true);
    expect(result.current.canEditNotes).toBe(true);
    expect(result.current.canPublishSchedule).toBe(false);
  });

  it("clears perms when auth transitions to signed-out", async () => {
    signIn({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });

    const { result, rerender } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("super_admin");

    signOut();
    rerender();

    await waitFor(() => expect(result.current.role).toBe("user"));
  });

  it("keeps resolved perms during same-user token refreshes", async () => {
    signIn({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });

    const { result, rerender } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("super_admin");

    // Same user, refreshed session — cache hit within the 10s window means
    // no re-fetch and the resolved perms survive.
    signIn({
      platform_role: "none",
      org_role: "super_admin",
      org_id: "org-1",
    });
    rerender();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("super_admin");
  });

  it("re-resolves when auth changes to a different user", async () => {
    signIn(
      {
        platform_role: "none",
        org_role: "super_admin",
        org_id: "org-1",
      },
      "u-1",
    );

    const { result, rerender } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.role).toBe("super_admin");

    signIn(
      {
        platform_role: "gridmaster",
        org_role: "user",
        org_id: null,
      },
      "u-2",
    );
    rerender();

    await waitFor(() => {
      expect(result.current.role).toBe("gridmaster");
    });
    expect(result.current.isGridmaster).toBe(true);
  });

  it("resolves user role correctly", async () => {
    signIn({
      platform_role: "none",
      org_role: "user",
      org_id: "org-1",
    });
    mockFetchAccountPermissions.mockResolvedValue({
      permissions: buildPerms("user", "org-1", false),
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

  it("canManageScheduleDefinitions implies canViewScheduleDefinitions", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageScheduleDefinitions: true };
    const result = applyViewImplications(perms);
    expect(result.canViewScheduleDefinitions).toBe(true);
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
    expect(result.canViewScheduleDefinitions).toBe(false);
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
    const oldStylePerms = {
      ...ALL_FALSE_PERMS,
      canManageEmployees: true,
      canManageFocusAreas: true,
      canManageScheduleDefinitions: true,
    };
    const result = applyViewImplications(oldStylePerms);
    expect(result.canViewEmployeeDetails).toBe(true);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canViewScheduleDefinitions).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part G: canAccessSettings (via usePermissions hook)
// ══════════════════════════════════════════════════════════════════════════════

describe("canAccessSettings", () => {
  it("is true for super_admin", async () => {
    signIn({
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
    signIn(
      {
        platform_role: "none",
        org_role: "admin",
        org_id: "org-1",
        org_slug: "acme",
      },
      "user-1",
    );
    mockFetchAccountPermissions.mockResolvedValue({
      permissions: buildPerms("admin", "org-1", false, {
        ...ALL_FALSE_PERMS,
        canViewFocusAreas: true,
      }),
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccessSettings).toBe(true);
    expect(result.current.canManageOrg).toBe(false);
  });

  it("is false for user with no view or manage permissions", async () => {
    signIn(
      {
        platform_role: "none",
        org_role: "user",
        org_id: "org-1",
        org_slug: "acme",
      },
      "user-1",
    );
    mockFetchAccountPermissions.mockResolvedValue({
      permissions: buildPerms("user", "org-1", false),
    });

    const { result } = renderHook(() => usePermissions());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canAccessSettings).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Part H: buildPerms — user role with direct + department permissions
// ══════════════════════════════════════════════════════════════════════════════

describe("buildPerms — user role per-user permissions", () => {
  it("user with admin_permissions set", () => {
    const perms = {
      ...ALL_FALSE_PERMS,
      canViewDashboardAnalytics: true,
      canViewEmployeeDetails: true,
    };
    const result = buildPerms("user", "org-1", false, perms);
    expect(result.canViewDashboardAnalytics).toBe(true);
    expect(result.canViewEmployeeDetails).toBe(true);
    expect(result.canEditShifts).toBe(false);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with edit perms configured per-user", () => {
    const perms = { ...ALL_FALSE_PERMS, canEditShifts: true, canEditNotes: true };
    const result = buildPerms("user", "org-1", false, perms);
    expect(result.canEditShifts).toBe(true);
    expect(result.canEditNotes).toBe(true);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with canManageOrgSettings true — forced false", () => {
    const perms = { ...ALL_FALSE_PERMS, canManageOrgSettings: true };
    const result = buildPerms("user", "org-1", false, perms);
    expect(result.canManageOrgSettings).toBe(false);
  });

  it("user with no permissions gets READ_ONLY_PERMS", () => {
    const result = buildPerms("user", "org-1", false, null);
    expect(result.canViewSchedule).toBe(true);
    expect(result.canViewStaff).toBe(true);
    expect(result.canEditShifts).toBe(false);
    expect(result.canViewDashboardAnalytics).toBe(false);
    expect(result.canAccessSettings).toBe(false);
  });

  it("user with view perms gets canAccessSettings", () => {
    const perms = { ...ALL_FALSE_PERMS, canViewFocusAreas: true };
    const result = buildPerms("user", "org-1", false, perms);
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
    const deptB = { ...ALL_FALSE_PERMS, canViewScheduleDefinitions: true };
    const result = unionPermissions([deptA, deptB]);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canViewScheduleDefinitions).toBe(true);
    expect(result.canManageFocusAreas).toBe(false);
    expect(result.canManageScheduleDefinitions).toBe(false);
  });

  it("preserves view permissions alongside manage permissions", () => {
    const deptA = { ...ALL_FALSE_PERMS, canViewFocusAreas: true };
    const deptB = { ...ALL_FALSE_PERMS, canManageFocusAreas: true };
    const result = unionPermissions([deptA, deptB]);
    expect(result.canViewFocusAreas).toBe(true);
    expect(result.canManageFocusAreas).toBe(true);
  });
});

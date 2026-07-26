import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthenticatedUserWithClaims = vi.fn();
const getImpersonationFromCookie = vi.fn();
const verifyImpersonationSession = vi.fn();
const serviceFrom = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requireAuthenticatedUserWithClaims: (req: NextRequest) => requireAuthenticatedUserWithClaims(req),
}));

vi.mock("@/lib/impersonation", () => ({
  getImpersonationFromCookie: (cookie: string) => getImpersonationFromCookie(cookie),
}));

vi.mock("@/lib/impersonation-server", () => ({
  verifyImpersonationSession: (...args: unknown[]) => verifyImpersonationSession(...args),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: serviceFrom }),
}));

import { GET } from "./route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_ORG_ID = "33333333-3333-4333-8333-333333333333";

const tableResults = new Map<string, Array<{ data: unknown; error: unknown }>>();

function enqueue(table: string, ...results: Array<{ data: unknown; error?: unknown }>) {
  tableResults.set(
    table,
    results.map((result) => ({ data: result.data, error: result.error ?? null })),
  );
}

function nextResult(table: string) {
  return tableResults.get(table)?.shift() ?? { data: null, error: null };
}

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(nextResult(table))),
    maybeSingle: vi.fn(() => Promise.resolve(nextResult(table))),
  };
  return query;
}

// The route derives orgId/effectiveRole from auth.claims — which
// requireAuthenticatedUserWithClaims has already sandbox-rewritten (org_id ->
// sandbox org, org_role -> "super_admin") by the time this route sees it.
// Driving these tests through `claims` directly (rather than a separately
// mocked JWT-decode helper) is what actually proves the route stays correct
// under sandbox mode: there's no other place left where a raw token re-decode
// could silently discard the sandbox rewrite (see account/permissions
// previously calling extractJwtClaims(auth.session.access_token) directly,
// which ignored auth.claims entirely).
function makeAuth(opts?: {
  factors?: Array<{ factor_type: string; status: string }>;
  orgId?: string | null;
  orgRole?: string;
  platformRole?: string;
}) {
  return {
    user: { id: USER_ID, email: "user@example.com", factors: opts?.factors },
    session: { access_token: "test-token" },
    claims: {
      sub: USER_ID,
      platform_role: opts?.platformRole ?? "none",
      org_id: opts?.orgId ?? null,
      org_role: opts?.orgRole,
    },
  };
}

describe("GET /api/account/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    requireAuthenticatedUserWithClaims.mockResolvedValue(makeAuth());
    getImpersonationFromCookie.mockReturnValue(null);
    verifyImpersonationSession.mockResolvedValue(null);
    serviceFrom.mockImplementation((table: string) => makeQuery(table));
  });

  function request() {
    return GET(new NextRequest("http://localhost/api/account/permissions"));
  }

  it("resolves super_admin permissions straight from the sandbox-rewritten claims", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "super_admin" }),
    );

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("super_admin");
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.isSuperAdmin).toBe(true);
    // Permissions are trusted from claims; no membership lookup. Self-employment
    // flags (isOnSchedule/isManagementUser) still require an employees read.
    expect(serviceFrom).not.toHaveBeenCalledWith("organization_memberships");
    expect(serviceFrom).toHaveBeenCalledWith("employees");
  });

  it("uses claims.org_id (the sandbox-redirected org), not the profile default, when they diverge", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: SECOND_ORG_ID, orgRole: "super_admin" }),
    );

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(SECOND_ORG_ID);
  });

  it("falls back to profile.org_id + live membership when claims lack an org id", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(makeAuth({ orgRole: "admin" }));
    enqueue("profiles", {
      data: { org_id: ORG_ID, platform_role: "none" },
    });
    enqueue("organization_memberships", {
      data: { org_role: "admin", admin_permissions: null },
    });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.permissions.role).toBe("admin");
  });

  it("fails closed to user permissions when no live membership exists", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(makeAuth({ orgRole: "user" }));
    enqueue("profiles", {
      data: { org_id: ORG_ID, platform_role: "none" },
    });
    enqueue("organization_memberships", { data: null });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("user");
    expect(body.permissions.orgId).toBeNull();
    expect(body.permissions.isSuperAdmin).toBe(false);
    expect(body.permissions.isGridmaster).toBe(false);
  });

  it("drops an inactive admin to read-only permissions", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "admin" }),
    );
    enqueue("employees", { data: { status: "inactive" } });
    enqueue("organization_memberships", {
      data: {
        org_role: "admin",
        admin_permissions: {
          canManageEmployees: true,
          canPublishSchedule: true,
          canEditShifts: true,
        },
      },
    });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.isInactive).toBe(true);
    expect(body.permissions.role).toBe("user");
    expect(body.permissions.level).toBe(0);
    expect(body.permissions.actualLevel).toBe(2);
    expect(body.permissions.canManageEmployees).toBe(false);
    expect(body.permissions.canPublishSchedule).toBe(false);
    expect(body.permissions.canEditShifts).toBe(false);
    expect(body.permissions.canViewSchedule).toBe(true);
    expect(body.permissions.orgId).toBe(ORG_ID);
  });

  it("does not consult employee status for gridmaster", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, platformRole: "gridmaster" }),
    );

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.isInactive).toBe(false);
    // Gridmasters don't have an employees row in the org they're viewing.
    expect(serviceFrom).not.toHaveBeenCalledWith("employees");
  });

  it("reports self-employment flags for a management-only super_admin", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "super_admin" }),
    );
    enqueue("employees", { data: { focus_area_ids: [], department_ids: [9] } });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.isInactive).toBe(false);
    expect(body.permissions.canManageEmployees).toBe(true);
    expect(body.isOnSchedule).toBe(false);
    expect(body.isManagementUser).toBe(true);
  });

  it("reports isOnSchedule for a super_admin who is also scheduled", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "super_admin" }),
    );
    enqueue("employees", { data: { focus_area_ids: [5], department_ids: [9] } });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isOnSchedule).toBe(true);
    expect(body.isManagementUser).toBe(true);
  });

  it("reports isOnSchedule for a scheduled employee", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "user" }),
    );
    enqueue(
      "employees",
      { data: { status: "active", focus_area_ids: [5], department_ids: [] } },
      { data: { status: "active", focus_area_ids: [5], department_ids: [] } },
    );
    enqueue("profiles", { data: { org_id: null, platform_role: "none" } });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isOnSchedule).toBe(true);
    expect(body.isManagementUser).toBe(false);
  });

  it("reports isManagementUser for a management-only employee", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "user" }),
    );
    enqueue(
      "employees",
      { data: { status: "active", focus_area_ids: [], department_ids: [9] } },
      { data: { status: "active", focus_area_ids: [], department_ids: [9] } },
    );
    enqueue("profiles", { data: { org_id: null, platform_role: "none" } });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isOnSchedule).toBe(false);
    expect(body.isManagementUser).toBe(true);
  });

  it("reports both flags false when the caller has no employees row", async () => {
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "user" }),
    );
    enqueue("profiles", { data: { org_id: null, platform_role: "none" } });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isOnSchedule).toBe(false);
    expect(body.isManagementUser).toBe(false);
  });

  it("reports super_admin permissions for a sandboxed caller with no personal employee row", async () => {
    // Mirrors the sandbox override in requireAuthenticatedUserWithClaims:
    // org_id -> sandbox org, org_role -> "super_admin". Sandbox employee
    // clones have user_id stripped, so the employees lookup finds nothing —
    // this must resolve to {isOnSchedule: false, isManagementUser: false},
    // never the caller's real schedule.
    requireAuthenticatedUserWithClaims.mockResolvedValue(
      makeAuth({ orgId: ORG_ID, orgRole: "super_admin" }),
    );
    enqueue("employees", { data: null });

    const response = await request();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions.role).toBe("super_admin");
    expect(body.permissions.orgId).toBe(ORG_ID);
    expect(body.isOnSchedule).toBe(false);
    expect(body.isManagementUser).toBe(false);
  });

  describe("mfaNagRequired", () => {
    it("nags a super_admin with no verified TOTP factor", async () => {
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({ orgId: ORG_ID, orgRole: "super_admin" }),
      );

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(true);
    });

    it("does not nag a super_admin who has a verified TOTP factor", async () => {
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({
          orgId: ORG_ID,
          orgRole: "super_admin",
          factors: [{ factor_type: "totp", status: "verified" }],
        }),
      );

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(false);
    });

    it("does not nag a super_admin whose only TOTP factor is unverified", async () => {
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({
          orgId: ORG_ID,
          orgRole: "super_admin",
          factors: [{ factor_type: "totp", status: "unverified" }],
        }),
      );

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(true);
    });

    it("does not nag a regular user without MFA", async () => {
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({ orgId: ORG_ID, orgRole: "user" }),
      );
      enqueue("profiles", { data: { org_id: null, platform_role: "none" } });

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(false);
    });

    it("nags a gridmaster with no verified TOTP factor", async () => {
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({ orgId: ORG_ID, platformRole: "gridmaster" }),
      );

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(true);
    });

    it("reflects the impersonating gridmaster's own MFA status, not the target's", async () => {
      getImpersonationFromCookie.mockReturnValue({
        sessionId: "session-1",
        targetOrgId: ORG_ID,
        targetUserId: "target-user",
        targetOrgRole: "user",
      });
      verifyImpersonationSession.mockResolvedValue({
        targetOrgId: ORG_ID,
        targetUserId: "target-user",
      });
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({
          orgId: ORG_ID,
          platformRole: "gridmaster",
          factors: [{ factor_type: "totp", status: "verified" }],
        }),
      );
      enqueue("organization_memberships", { data: { org_role: "user", admin_permissions: null } });

      const response = await request();

      const body = await response.json();
      expect(body.mfaNagRequired).toBe(false);
      expect(verifyImpersonationSession).toHaveBeenCalledWith(
        expect.anything(),
        "session-1",
        USER_ID,
      );
    });

    it("ignores an impersonation cookie whose session isn't verified, falling back to the caller's real permissions", async () => {
      getImpersonationFromCookie.mockReturnValue({
        sessionId: "forged-session",
        targetOrgId: SECOND_ORG_ID,
        targetUserId: "someone-elses-account",
        targetOrgRole: "super_admin",
      });
      // No matching impersonation_sessions row (expired, ended, or never real).
      verifyImpersonationSession.mockResolvedValue(null);
      requireAuthenticatedUserWithClaims.mockResolvedValue(
        makeAuth({
          orgId: ORG_ID,
          platformRole: "gridmaster",
          factors: [{ factor_type: "totp", status: "verified" }],
        }),
      );

      const response = await request();

      expect(response.status).toBe(200);
      const body = await response.json();
      // Falls through to the gridmaster's own (real) permissions, never the
      // forged cookie's target org/role.
      expect(body.permissions.role).toBe("gridmaster");
      expect(body.permissions.orgId).not.toBe(SECOND_ORG_ID);
    });
  });
});

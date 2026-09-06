import { describe, expect, it } from "vitest";

import {
  applyViewImplications,
  buildPerms,
  extractJwtClaims,
  getPermissionsFromSession,
  READ_ONLY_PERMS,
  ROLE_LEVEL,
  VIEW_IMPLICATIONS,
} from "./index";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "none" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("ROLE_LEVEL", () => {
  it("ranks roles from user (lowest) to gridmaster (highest)", () => {
    expect(ROLE_LEVEL.user).toBe(0);
    expect(ROLE_LEVEL.admin).toBeGreaterThan(ROLE_LEVEL.user);
    expect(ROLE_LEVEL.super_admin).toBeGreaterThan(ROLE_LEVEL.admin);
    expect(ROLE_LEVEL.gridmaster).toBeGreaterThan(ROLE_LEVEL.super_admin);
  });
});

describe("applyViewImplications", () => {
  it("grants the view permission whenever the matching manage permission is true", () => {
    const result = applyViewImplications({
      ...READ_ONLY_PERMS,
      canManageEmployees: true,
      canViewEmployeeDetails: false,
    });
    expect(result.canViewEmployeeDetails).toBe(true);
  });

  it("does not grant a view permission when its manage permission is false", () => {
    const result = applyViewImplications(READ_ONLY_PERMS);
    expect(result.canViewEmployeeDetails).toBe(false);
  });

  it("derives dashboard analytics from any of the keys the map names", () => {
    for (const key of VIEW_IMPLICATIONS.canViewDashboardAnalytics ?? []) {
      const result = applyViewImplications({ ...READ_ONLY_PERMS, [key]: true });
      expect(result.canViewDashboardAnalytics, key).toBe(true);
    }
    expect(applyViewImplications(READ_ONLY_PERMS).canViewDashboardAnalytics).toBe(false);
  });

  it("never implies reports, which is granted on its own", () => {
    const result = applyViewImplications({
      ...READ_ONLY_PERMS,
      canEditShifts: true,
      canManageEmployees: true,
    });
    expect(result.canViewReports).toBe(false);
  });

  it("only ever lists view keys as targets and never a key as its own source", () => {
    for (const [viewKey, sources] of Object.entries(VIEW_IMPLICATIONS)) {
      expect(viewKey.startsWith("canView")).toBe(true);
      expect(sources).not.toContain(viewKey);
    }
  });
});

describe("buildPerms", () => {
  it("grants gridmaster every permission", () => {
    const perms = buildPerms("gridmaster", "org-1", false);
    expect(perms.canManageEmployees).toBe(true);
    expect(perms.canManageOrgSettings).toBe(true);
    expect(perms.isGridmaster).toBe(true);
  });

  it("gives an unconfigured admin the core scheduling baseline and nothing else", () => {
    const perms = buildPerms("admin", "org-1", false, null);
    expect(perms.canEditShifts).toBe(true);
    expect(perms.canPublishSchedule).toBe(true);
    expect(perms.canManageRecurringShifts).toBe(true);
    expect(perms.canApplyRecurringSchedule).toBe(true);
    expect(perms.canViewReports).toBe(true);
    expect(perms.canManageEmployees).toBe(false);
    expect(perms.canViewEmployeeDetails).toBe(false);
    expect(perms.canApproveShiftRequests).toBe(false);
    expect(perms.canManageFocusAreas).toBe(false);
    expect(perms.canManageCoverageRequirements).toBe(false);
    expect(perms.canAccessSettings).toBe(false);
  });

  it("keeps an unconfigured user on the read-only baseline", () => {
    const perms = buildPerms("user", "org-1", false, null);
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canViewReports).toBe(false);
    expect(perms.canViewSchedule).toBe(true);
  });

  it("strips inactive users to read-only regardless of underlying role", () => {
    const perms = buildPerms(
      "admin",
      "org-1",
      false,
      { ...READ_ONLY_PERMS, canManageEmployees: true },
      false,
      true,
    );
    expect(perms.isInactive).toBe(true);
    expect(perms.canManageEmployees).toBe(false);
    expect(perms.role).toBe("user");
  });

  it("strips manage permissions while impersonating", () => {
    const perms = buildPerms("gridmaster", "org-1", false, null, true);
    expect(perms.canManageEmployees).toBe(false);
    expect(perms.isImpersonating).toBe(true);
  });

  // admin_permissions is an unvalidated JSONB column, so the resolver has to
  // hold these guarantees itself rather than trust whatever wrote the row.
  it("resolves a partial admin_permissions JSONB against the admin baseline", () => {
    const perms = buildPerms("admin", "org-1", false, {
      canEditShifts: false,
      canManageEmployees: true,
    } as unknown as typeof READ_ONLY_PERMS);
    // Explicit values win over the baseline in both directions.
    expect(perms.canEditShifts).toBe(false);
    expect(perms.canManageEmployees).toBe(true);
    // Keys the row never mentions take the baseline, not undefined.
    expect(perms.canPublishSchedule).toBe(true);
    expect(perms.canApproveShiftRequests).toBe(false);
  });

  it("keeps canViewStaff true for an admin, as it already was for a user", () => {
    const stored = { ...READ_ONLY_PERMS, canViewStaff: false };
    expect(buildPerms("admin", "org-1", false, stored).canViewStaff).toBe(true);
    expect(buildPerms("user", "org-1", false, stored).canViewStaff).toBe(true);
  });

  it("never lets a stored JSONB delegate canManageOrgSettings to an admin", () => {
    const stored = { ...READ_ONLY_PERMS, canManageOrgSettings: true };
    expect(buildPerms("admin", "org-1", false, stored).canManageOrgSettings).toBe(false);
    expect(buildPerms("user", "org-1", false, stored).canManageOrgSettings).toBe(false);
  });

  it("keeps reports on for an admin whose stored set predates the key", () => {
    expect(buildPerms("admin", "org-1", false, null).canViewReports).toBe(true);
    expect(
      buildPerms("admin", "org-1", false, { canEditShifts: true } as never).canViewReports,
    ).toBe(true);
    expect(
      buildPerms("admin", "org-1", false, { ...READ_ONLY_PERMS, canViewReports: false })
        .canViewReports,
    ).toBe(false);
    expect(buildPerms("user", "org-1", false, null).canViewReports).toBe(false);
  });

  it("never lets a stored JSONB grant canManageUsers", () => {
    const perms = buildPerms("admin", "org-1", false, {
      canManageUsers: true,
    } as unknown as typeof READ_ONLY_PERMS);
    expect(perms.canManageUsers).toBe(false);
    expect(perms.canConfigureAdminPermissions).toBe(false);
  });

  it("atLeast compares against the caller's resolved level", () => {
    const perms = buildPerms("super_admin", "org-1", false);
    expect(perms.atLeast("admin")).toBe(true);
    expect(perms.atLeast("gridmaster")).toBe(false);
  });
});

describe("extractJwtClaims", () => {
  it("reads org_role and org_id from a well-formed token", () => {
    const token = makeJwt({ org_role: "admin", org_id: "org-42" });
    expect(extractJwtClaims(token)).toEqual({
      effectiveRole: "admin",
      orgId: "org-42",
    });
  });

  it("treats platform_role gridmaster as taking precedence over org_role", () => {
    const token = makeJwt({
      platform_role: "gridmaster",
      org_role: "admin",
      org_id: "org-42",
    });
    expect(extractJwtClaims(token).effectiveRole).toBe("gridmaster");
  });

  it("defaults to user/null claims for a malformed token", () => {
    expect(extractJwtClaims("not-a-jwt")).toEqual({
      effectiveRole: "user",
      orgId: null,
    });
  });
});

describe("getPermissionsFromSession", () => {
  it("returns no-permissions for a null session", () => {
    const perms = getPermissionsFromSession(null);
    expect(perms.role).toBe("user");
    expect(perms.canManageEmployees).toBe(false);
  });

  it("derives permissions from a session's access token claims", () => {
    const token = makeJwt({ org_role: "super_admin", org_id: "org-7" });
    const perms = getPermissionsFromSession({
      access_token: token,
    } as never);
    expect(perms.isSuperAdmin).toBe(true);
    expect(perms.orgId).toBe("org-7");
  });
});

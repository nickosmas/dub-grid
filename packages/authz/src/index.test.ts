import { describe, expect, it } from "vitest";

import {
  applyViewImplications,
  buildPerms,
  extractJwtClaims,
  getPermissionsFromSession,
  READ_ONLY_PERMS,
  ROLE_LEVEL,
  unionPermissions,
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
});

describe("unionPermissions", () => {
  it("grants a permission if any set in the union grants it", () => {
    const result = unionPermissions([{ ...READ_ONLY_PERMS, canEditShifts: true }, READ_ONLY_PERMS]);
    expect(result.canEditShifts).toBe(true);
  });

  it("always forces canManageOrgSettings to false regardless of input", () => {
    const result = unionPermissions([{ ...READ_ONLY_PERMS, canManageOrgSettings: true }]);
    expect(result.canManageOrgSettings).toBe(false);
  });
});

describe("buildPerms", () => {
  it("grants gridmaster every permission", () => {
    const perms = buildPerms("gridmaster", "org-1", false);
    expect(perms.canManageEmployees).toBe(true);
    expect(perms.canManageOrgSettings).toBe(true);
    expect(perms.isGridmaster).toBe(true);
  });

  it("falls back admins with no admin_permissions grant to read-only", () => {
    const perms = buildPerms("admin", "org-1", false, null);
    expect(perms.canManageEmployees).toBe(false);
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

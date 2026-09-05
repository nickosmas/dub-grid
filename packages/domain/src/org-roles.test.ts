import { describe, expect, it } from "vitest";
import {
  ORG_ROLE_PRIVILEGE_ORDER,
  getEffectiveOrgRole,
  getOrgRoleInsignia,
  getOrgRolePrivilegeRank,
  type OrgRole,
} from "./org-roles";

describe("getEffectiveOrgRole", () => {
  it("keeps the elevated tiers as they are", () => {
    expect(getEffectiveOrgRole("super_admin")).toBe("super_admin");
    expect(getEffectiveOrgRole("admin")).toBe("admin");
  });

  it("treats a member with no account as a plain user", () => {
    expect(getEffectiveOrgRole(null)).toBe("user");
    expect(getEffectiveOrgRole(undefined)).toBe("user");
  });

  it("treats an unknown role as a plain user", () => {
    expect(getEffectiveOrgRole("gridmaster")).toBe("user");
  });
});

describe("getOrgRoleInsignia", () => {
  it("crowns a super admin and stars an admin", () => {
    expect(getOrgRoleInsignia("super_admin")).toBe("crown");
    expect(getOrgRoleInsignia("admin")).toBe("star");
  });

  it("leaves a plain user unmarked", () => {
    expect(getOrgRoleInsignia("user")).toBeNull();
    expect(getOrgRoleInsignia(null)).toBeNull();
    expect(getOrgRoleInsignia(undefined)).toBeNull();
  });

  it("leaves a platform role unmarked, since it is not an org tier", () => {
    expect(getOrgRoleInsignia("gridmaster")).toBeNull();
    expect(getOrgRoleInsignia("owner")).toBeNull();
  });
});

describe("getOrgRolePrivilegeRank", () => {
  it("ranks the tiers most privileged first", () => {
    expect(getOrgRolePrivilegeRank("super_admin")).toBeLessThan(getOrgRolePrivilegeRank("admin"));
    expect(getOrgRolePrivilegeRank("admin")).toBeLessThan(getOrgRolePrivilegeRank("user"));
  });

  it("ranks members with no account alongside plain users", () => {
    expect(getOrgRolePrivilegeRank(null)).toBe(getOrgRolePrivilegeRank("user"));
    expect(getOrgRolePrivilegeRank(undefined)).toBe(getOrgRolePrivilegeRank("user"));
  });

  it("orders the offered tiers the way the sort ranks them", () => {
    const ranked = [...ORG_ROLE_PRIVILEGE_ORDER].sort(
      (left: OrgRole, right: OrgRole) =>
        getOrgRolePrivilegeRank(left) - getOrgRolePrivilegeRank(right),
    );
    expect(ranked).toEqual(ORG_ROLE_PRIVILEGE_ORDER);
  });
});

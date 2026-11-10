import { describe, expect, it } from "vitest";
import {
  ORG_ROLE_PRIVILEGE_ORDER,
  canGrantOrgRole,
  getOrgRoleGrantRefusal,
  getEffectiveOrgRole,
  getOrgRoleInsignia,
  getOwnOrgRoleChange,
  getOwnOrgRoleChangedMessage,
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
  it("gives a super admin a gold star and an admin a blue one", () => {
    expect(getOrgRoleInsignia("super_admin")).toBe("gold");
    expect(getOrgRoleInsignia("admin")).toBe("blue");
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

describe("getOwnOrgRoleChange", () => {
  const ORG = "org-1";

  it("names the new role when the earlier reading of the same org differs", () => {
    expect(
      getOwnOrgRoleChange({ orgId: ORG, role: "admin" }, { orgId: ORG, role: "super_admin" }),
    ).toBe("admin");
    expect(getOwnOrgRoleChange({ orgId: ORG, role: "admin" }, { orgId: ORG, role: "user" })).toBe(
      "admin",
    );
  });

  it("finds nothing when the role is the same", () => {
    expect(getOwnOrgRoleChange({ orgId: ORG, role: "user" }, { orgId: ORG, role: "user" })).toBe(
      null,
    );
  });

  it("never treats a different organization as a role change", () => {
    expect(
      getOwnOrgRoleChange({ orgId: "sandbox", role: "super_admin" }, { orgId: ORG, role: "user" }),
    ).toBe(null);
    expect(getOwnOrgRoleChange({ orgId: null, role: "user" }, { orgId: null, role: "admin" })).toBe(
      null,
    );
  });

  it("ignores a platform role or a missing one", () => {
    expect(
      getOwnOrgRoleChange({ orgId: ORG, role: "gridmaster" }, { orgId: ORG, role: "admin" }),
    ).toBe(null);
    expect(getOwnOrgRoleChange({ orgId: ORG, role: "admin" }, { orgId: ORG, role: null })).toBe(
      null,
    );
  });
});

describe("getOwnOrgRoleChangedMessage", () => {
  it("names the new role", () => {
    expect(getOwnOrgRoleChangedMessage("super_admin")).toBe(
      "Your role changed to Super Admin, so what you can see has updated.",
    );
  });
});

describe("canGrantOrgRole", () => {
  const admin = { isSuperAdmin: false, isGridmaster: false };
  const superAdmin = { isSuperAdmin: true, isGridmaster: false };
  const gridmaster = { isSuperAdmin: false, isGridmaster: true };

  it("lets an Admin invite only Users (F-238)", () => {
    expect(canGrantOrgRole(admin, "user")).toBe(true);
    expect(canGrantOrgRole(admin, "admin")).toBe(false);
    expect(canGrantOrgRole(admin, "super_admin")).toBe(false);
  });

  it("lets a Super Admin or Gridmaster give every tier", () => {
    for (const actor of [superAdmin, gridmaster]) {
      for (const role of ORG_ROLE_PRIVILEGE_ORDER) {
        expect(canGrantOrgRole(actor, role)).toBe(true);
      }
    }
  });

  it("refuses a role it doesn't know", () => {
    expect(canGrantOrgRole(admin, "owner")).toBe(false);
  });

  it("names the tier that is out of reach", () => {
    expect(getOrgRoleGrantRefusal("admin")).toBe(
      "Only a Super Admin can invite someone as an Admin.",
    );
    expect(getOrgRoleGrantRefusal("super_admin")).toBe(
      "Only a Super Admin can invite someone as a Super Admin.",
    );
  });
});

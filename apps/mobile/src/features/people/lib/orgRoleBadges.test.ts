import { describe, expect, it } from "vitest";
import { mobileColors } from "../../../shared/theme/tokens";
import { getMobileOrgRoleBadge, getMobileOrgRoleHeroBadge } from "./orgRoleBadges";

describe("getMobileOrgRoleBadge", () => {
  it("crowns a super admin and stars an admin, each in its own tone", () => {
    const superAdmin = getMobileOrgRoleBadge(mobileColors, "super_admin");
    expect(superAdmin?.icon).toBe("crown");
    expect(superAdmin?.label).toBe("Super Admin");
    expect(superAdmin?.containerStyle.backgroundColor).toBe(mobileColors.warningSoft);
    expect(superAdmin?.textStyle.color).toBe(mobileColors.warningText);

    const admin = getMobileOrgRoleBadge(mobileColors, "admin");
    expect(admin?.icon).toBe("star");
    expect(admin?.label).toBe("Admin");
    expect(admin?.containerStyle.backgroundColor).toBe(mobileColors.brandSoft);
    expect(admin?.textStyle.color).toBe(mobileColors.brand);
  });

  it("leaves a plain user and a member with no account unbadged", () => {
    expect(getMobileOrgRoleBadge(mobileColors, "user")).toBeNull();
    expect(getMobileOrgRoleBadge(mobileColors, null)).toBeNull();
    expect(getMobileOrgRoleBadge(mobileColors, undefined)).toBeNull();
  });
});

describe("getMobileOrgRoleHeroBadge", () => {
  // The hero badges every tier: on a page about one person the access level is
  // a fact about them, not a highlight picked out of a list.
  it("names every tier, User included", () => {
    expect(getMobileOrgRoleHeroBadge("super_admin").label).toBe("Super Admin");
    expect(getMobileOrgRoleHeroBadge("admin").label).toBe("Admin");
    expect(getMobileOrgRoleHeroBadge("user").label).toBe("User");
    expect(getMobileOrgRoleHeroBadge(null).label).toBe("User");
  });
});

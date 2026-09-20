import { describe, expect, it } from "vitest";
import { mobileColors } from "../../../shared/theme/tokens";
import { getMobileOrgRoleBadge } from "./orgRoleBadges";

describe("getMobileOrgRoleBadge", () => {
  it("badges a super admin and an admin, each in its own tone", () => {
    const superAdmin = getMobileOrgRoleBadge(mobileColors, "super_admin");
    expect(superAdmin?.label).toBe("Super Admin");
    expect(superAdmin?.containerStyle.backgroundColor).toBe(mobileColors.warningSoft);
    expect(superAdmin?.textStyle.color).toBe(mobileColors.warningText);

    const admin = getMobileOrgRoleBadge(mobileColors, "admin");
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

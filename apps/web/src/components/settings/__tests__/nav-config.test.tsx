import { describe, expect, it } from "vitest";

import { buildNavGroups, type NavPermissions } from "@/components/settings/nav-config";

const fullSettingsPermissions: NavPermissions = {
  canManageOrg: true,
  canAccessSettings: true,
  isSuperAdmin: true,
  isGridmaster: false,
  canManageOrgLabels: true,
  canViewOrgLabels: true,
  canManageFocusAreas: true,
  canViewFocusAreas: true,
  canManageScheduleDefinitions: true,
  canViewScheduleDefinitions: true,
  canManageIndicatorTypes: true,
  canViewIndicatorTypes: true,
  canManageOrgSettings: true,
  canManageCoverageRequirements: true,
  canViewCoverageRequirements: true,
};

describe("settings nav config", () => {
  it("places the departments page in Organization after customization", () => {
    const groups = buildNavGroups(fullSettingsPermissions);

    const organizationGroup = groups.find((group) => group.id === "organization");
    const staffGroup = groups.find((group) => group.id === "staff");

    expect(organizationGroup?.items.map((item) => item.id)).toEqual([
      "org-general",
      "org-billing",
      "org-labels",
      "staff-departments",
      "org-activity",
    ]);
    expect(organizationGroup?.items.map((item) => item.label)).toEqual([
      "Organization Details",
      "Billing",
      "Customization",
      "Departments",
      "Activity Log",
    ]);
    expect(
      organizationGroup?.items.find((item) => item.id === "staff-departments")?.description,
    ).toBe(
      "Includes scheduled departments for the grid and management departments for app-only staff.",
    );
    expect(staffGroup?.items.map((item) => item.id)).toEqual([
      "staff-roles",
      "staff-certifications",
    ]);
  });

  it("exposes the activity log and danger zone to super admins only", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const allIds = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(allIds).toContain("org-activity");
    expect(allIds).toContain("org-danger");

    const dangerGroup = groups.find((group) => group.id === "danger");
    expect(dangerGroup?.items.map((item) => item.id)).toEqual(["org-danger"]);
    // Danger zone renders last in the sidebar.
    expect(groups[groups.length - 1]?.id).toBe("danger");
  });

  it("hides the activity log and danger zone from non-super-admins", () => {
    const adminPermissions: NavPermissions = {
      ...fullSettingsPermissions,
      isSuperAdmin: false,
    };
    const groups = buildNavGroups(adminPermissions);
    const allIds = groups.flatMap((group) => group.items.map((item) => item.id));

    expect(allIds).not.toContain("org-activity");
    expect(allIds).not.toContain("org-danger");
    expect(groups.find((group) => group.id === "danger")).toBeUndefined();
  });
});

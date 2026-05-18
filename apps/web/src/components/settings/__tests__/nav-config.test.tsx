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
    ]);
    expect(organizationGroup?.items.map((item) => item.label)).toEqual([
      "Organization Details",
      "Billing",
      "Customization",
      "Departments",
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
});

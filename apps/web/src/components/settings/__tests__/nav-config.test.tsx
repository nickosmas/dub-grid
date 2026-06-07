import { describe, expect, it } from "vitest";

import {
  buildNavGroups,
  getDefaultSection,
  type NavPermissions,
} from "@/components/settings/nav-config";

const noOrgAccess: NavPermissions = {
  canManageOrg: false,
  canAccessSettings: false,
  isSuperAdmin: false,
  isGridmaster: false,
  canManageOrgLabels: false,
  canViewOrgLabels: false,
  canManageFocusAreas: false,
  canViewFocusAreas: false,
  canManageScheduleDefinitions: false,
  canViewScheduleDefinitions: false,
  canManageIndicatorTypes: false,
  canViewIndicatorTypes: false,
  canManageOrgSettings: false,
  canManageCoverageRequirements: false,
  canViewCoverageRequirements: false,
};

const fullSettingsPermissions: NavPermissions = {
  ...noOrgAccess,
  canManageOrg: true,
  canAccessSettings: true,
  isSuperAdmin: true,
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
  it("always exposes the Account group with Profile/Security/Notifications/Privacy", () => {
    for (const perms of [noOrgAccess, fullSettingsPermissions]) {
      const groups = buildNavGroups(perms);
      const account = groups.find((g) => g.id === "account");
      expect(account?.label).toBe("Account");
      expect(account?.items.map((i) => i.id)).toEqual([
        "profile",
        "security",
        "notifications",
        "privacy",
      ]);
    }
  });

  it("renders only the Account group for account-only users", () => {
    const groups = buildNavGroups(noOrgAccess);
    expect(groups.map((g) => g.id)).toEqual(["account"]);
  });

  it("does not expose an Organizations switcher (web org-switching is disabled)", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).not.toContain("organizations");
    expect(groups.find((g) => g.id === "memberships")).toBeUndefined();
  });

  it("groups General with org identity + labels only", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const general = groups.find((g) => g.id === "general");

    expect(general?.label).toBe("General");
    expect(general?.items.map((item) => item.id)).toEqual([
      "org-general",
      "org-labels",
    ]);
    expect(general?.items.map((item) => item.label)).toEqual([
      "Organization Details",
      "Labels",
    ]);
  });

  it("groups Staff designations with Departments first, then Roles and Certifications", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const staff = groups.find((g) => g.id === "staff");

    expect(staff?.label).toBe("Staff designations");
    expect(staff?.items.map((item) => item.id)).toEqual([
      "staff-departments",
      "staff-roles",
      "staff-certifications",
    ]);
  });

  it("breaks Billing into its own group", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const billing = groups.find((g) => g.id === "billing");

    expect(billing?.label).toBe("Billing");
    expect(billing?.items.map((item) => item.id)).toEqual(["org-billing"]);
  });

  it("promotes Audit out of the sidebar footer into its own group", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const audit = groups.find((g) => g.id === "audit");

    expect(audit?.label).toBe("Audit");
    expect(audit?.items.map((item) => item.id)).toEqual(["org-activity"]);
  });

  it("renders the group order: Account, General, Scheduling, Staff designations, Billing, Audit, Danger Zone", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    expect(groups.map((g) => g.id)).toEqual([
      "account",
      "general",
      "scheduling",
      "staff",
      "billing",
      "audit",
      "danger",
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
    expect(groups.find((group) => group.id === "audit")).toBeUndefined();
    expect(groups.find((group) => group.id === "danger")).toBeUndefined();
  });

  it("shows the Platform group with Impersonation for gridmasters", () => {
    const groups = buildNavGroups({ ...fullSettingsPermissions, isGridmaster: true });
    const platform = groups.find((g) => g.id === "platform");
    expect(platform?.items.map((item) => item.id)).toEqual(["platform-impersonation"]);
  });

  it("defaults admins to the first org-side section so account groups don't hijack their landing", () => {
    expect(getDefaultSection(fullSettingsPermissions)).toBe("org-general");
  });

  it("defaults account-only users to Profile", () => {
    expect(getDefaultSection(noOrgAccess)).toBe("profile");
  });
});

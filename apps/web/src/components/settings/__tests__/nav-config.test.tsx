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

  it("renders the group order: General, Staff designations, Scheduling, Billing, Audit, Danger Zone", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    expect(groups.map((g) => g.id)).toEqual([
      "general",
      "staff",
      "scheduling",
      "billing",
      "audit",
      "danger",
    ]);
  });

  it("does not expose any account-scope sections (those live on /profile)", () => {
    const groups = buildNavGroups(fullSettingsPermissions);
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    for (const accountId of ["profile", "security", "notifications", "privacy"]) {
      expect(allIds).not.toContain(accountId);
    }
    expect(groups.find((g) => g.id === "account")).toBeUndefined();
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

  it("shows the Platform group with Impersonation for gridmasters", () => {
    const groups = buildNavGroups({ ...fullSettingsPermissions, isGridmaster: true });
    const platform = groups.find((g) => g.id === "platform");
    expect(platform?.items.map((item) => item.id)).toEqual(["platform-impersonation"]);
  });
});

import { describe, expect, it } from "vitest";
import { ADMIN_DEFAULT_PERMS } from "@dubgrid/authz";
import {
  listPermissionChanges,
  PERMISSION_LABELS,
  permissionLabel,
  summarizePermissionChanges,
} from "./permission-labels";

describe("PERMISSION_LABELS", () => {
  it("names every flag by the editor row and level that sets it", () => {
    for (const key of Object.keys(ADMIN_DEFAULT_PERMS)) {
      expect(PERMISSION_LABELS[key as keyof typeof PERMISSION_LABELS]).toMatch(/: (View|Edit)$/);
    }
    expect(PERMISSION_LABELS.canManageFocusAreas).toBe("Departments & labels: Edit");
    expect(PERMISSION_LABELS.canManageShiftSeries).toBe("Recurring shifts: Edit");
    expect(PERMISSION_LABELS.canViewEmployeeDetails).toBe("Staff: View");
  });

  it("names a key retired by 061 as the level that replaced it", () => {
    expect(permissionLabel("canEditScheduleIndicators")).toBe("Schedule: Edit");
  });
});

describe("listPermissionChanges", () => {
  it("lists a level once though several flags behind it moved", () => {
    expect(
      listPermissionChanges(
        { canManageRecurringShifts: false, canManageShiftSeries: false },
        { canManageRecurringShifts: true, canManageShiftSeries: true },
      ),
    ).toEqual({ granted: ["Recurring shifts: Edit"], revoked: [] });
  });
});

describe("summarizePermissionChanges", () => {
  it("returns null when nothing changed", () => {
    expect(summarizePermissionChanges({ canViewStaff: true }, { canViewStaff: true })).toBeNull();
  });

  it("names both directions in one sentence fragment", () => {
    expect(
      summarizePermissionChanges(
        { canEditShifts: true, canViewReports: false },
        { canEditShifts: false, canViewReports: true },
      ),
    ).toBe("turned on Reports: View, and turned off Schedule: Edit");
  });

  it("caps long lists so an inbox row stays readable", () => {
    const before = {
      canViewReports: true,
      canViewDashboardAnalytics: true,
      canViewOrgLabels: true,
      canViewCoverageRequirements: true,
      canViewIndicatorTypes: true,
    };
    const after = Object.fromEntries(Object.keys(before).map((key) => [key, false]));

    expect(summarizePermissionChanges(before, after)).toBe(
      "turned off Reports: View, Dashboard: View, Departments & labels: View, and 2 more",
    );
  });
});

import { expect, test } from "@playwright/test";
import { loginAsQaAccount, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";
import { setLocalAdminPermissions } from "./helpers/local-auth-state";
import {
  collectUnexpectedRuntimeFailures,
  expectNav,
  walkRoutes,
  warmUpAndCaptureEmployeeHref,
} from "./helpers/role-variance";

// 40e3: the matrix's limited admin. qa-admin is narrowed for this file to
// viewing the schedule and staff and approving requests, the shape of an
// admin given one job, and put back afterwards.

// Every key is written, as the permissions editor does: a missing key would
// fall back to the admin defaults (editing, publishing, reports).
const LIMITED: Record<string, boolean> = {
  canViewSchedule: true,
  canEditShifts: false,
  canPublishSchedule: false,
  canApplyRecurringSchedule: false,
  canEditNotes: false,
  canViewRecurringShifts: false,
  canManageRecurringShifts: false,
  canManageShiftSeries: false,
  canViewStaff: true,
  canViewEmployeeDetails: false,
  canManageEmployees: false,
  canViewFocusAreas: false,
  canManageFocusAreas: false,
  canViewScheduleDefinitions: false,
  canManageScheduleDefinitions: false,
  canViewIndicatorTypes: false,
  canManageIndicatorTypes: false,
  canManageOrgSettings: false,
  canViewOrgLabels: false,
  canManageOrgLabels: false,
  canViewCoverageRequirements: false,
  canManageCoverageRequirements: false,
  canApproveShiftRequests: true,
  canViewDashboardAnalytics: false,
  canViewReports: false,
};

let original: Record<string, boolean> | null = null;

test.beforeAll(async () => {
  original = await setLocalAdminPermissions(QA_ADMIN_EMAIL, "calmhaven", LIMITED);
});

test.afterAll(async () => {
  if (original) await setLocalAdminPermissions(QA_ADMIN_EMAIL, "calmhaven", original);
});

test.describe("role variance: limited admin route entry contract", () => {
  test("qa-admin narrowed to schedule, staff and approvals", async ({ page }) => {
    test.setTimeout(180_000);
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await walkRoutes(page, [
      // Approving requests implies dashboard analytics, so the admin dashboard renders.
      {
        path: "/dashboard",
        finalUrl: /\/dashboard$/,
        marker: (p) => p.getByText("Overtime watch"),
      },
      { path: "/schedule", finalUrl: /\/schedule$/, marker: (p) => p.getByRole("grid") },
      {
        // canViewStaff without canManageEmployees: the roster, without Add.
        path: "/people",
        finalUrl: /\/people$/,
        marker: (p) => p.locator("tbody tr").first(),
      },
      // No canViewReports: Reports sends the admin back to the dashboard.
      { path: "/reports", finalUrl: /\/dashboard$/, marker: (p) => p.getByText("Overtime watch") },
      // No settings view permission: Settings sends the admin to their profile.
      {
        path: "/settings",
        finalUrl: /\/profile/,
        marker: (p) => p.getByRole("button", { name: "Edit details", exact: true }),
      },
    ]);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);
    await expect(page.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);

    await expectNav(page, ["Dashboard", "Schedule", "People"], ["Reports", "Settings"]);
    expect(failures).toEqual([]);
  });
});

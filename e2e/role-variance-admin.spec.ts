import { expect, test } from "@playwright/test";
import { loginAsQaAccount, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";
import {
  collectUnexpectedRuntimeFailures,
  expectNav,
  scheduledCell,
  walkRoutes,
  warmUpAndCaptureEmployeeHref,
} from "./helpers/role-variance";

// 25d2c: the 25d1 route matrix as qa-admin. The seed gives the fixture every
// admin permission (allAdminPermsObj), so its contract is the super admin's
// minus the super-admin-only settings sections and org-level controls.

const SUPER_ADMIN_ONLY_SETTINGS = [
  "Organization Details",
  "Subscription",
  "Activity Log",
  "Danger Zone",
  // canManageOrgSettings is forced false for admins in buildPerms.
  "Shift Display Mode",
];

test.describe("role variance: qa-admin route entry contract", () => {
  test("qa-admin (admin, all admin permissions, on schedule)", async ({ page }) => {
    test.setTimeout(180_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await walkRoutes(page, [
      {
        // getDashboardRoleVariant() -> "admin" (level 2): AdminDashboard.
        path: "/dashboard",
        finalUrl: /\/dashboard$/,
        marker: (p) => p.getByText("Overtime watch"),
      },
      { path: "/schedule", finalUrl: /\/schedule$/, marker: (p) => p.getByRole("grid") },
      {
        // canManageEmployees: the Add action is offered.
        path: "/people",
        finalUrl: /\/people$/,
        marker: (p) => p.getByRole("button", { name: "Add", exact: true }),
      },
      {
        // canEditDetails: StaffDetailPage renders the persistent EditEmployeePanel.
        path: employeeHref,
        finalUrl: new RegExp(`${employeeHref.replace(/\//g, "\\/")}$`),
        marker: (p) => p.getByRole("button", { name: "Save", exact: true }),
      },
      {
        path: "/profile",
        finalUrl: /\/profile/,
        marker: (p) => p.getByRole("link", { name: "Overview", exact: true }),
      },
      {
        // canViewReports is in ADMIN_DEFAULT_PERMS: the page renders.
        path: "/reports",
        finalUrl: /\/reports$/,
        marker: (p) => p.getByRole("button", { name: "Generate report" }),
      },
      { path: "/alerts", finalUrl: /\/alerts$/, marker: (p) => p.getByText("Inbox") },
      {
        // proxy.ts admits level >= admin; canAccessSettings holds through the
        // view permissions, and Labels is offered to anyone with canViewOrgLabels.
        path: "/settings",
        finalUrl: /\/settings/,
        marker: (p) => p.getByRole("link", { name: "Labels", exact: true }),
      },
    ]);

    for (const label of SUPER_ADMIN_ONLY_SETTINGS) {
      await expect(page.getByRole("link", { name: label, exact: true }), label).toHaveCount(0);
    }

    await expectNav(page, ["Dashboard", "Schedule", "People", "Reports", "Settings"], []);
    expect(failures).toEqual([]);
  });
});

test.describe("role variance: qa-admin interaction contract", () => {
  test("qa-admin gets editable surfaces, and inaccessible settings fall back", async ({ page }) => {
    test.setTimeout(180_000);
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);

    // /people: canManageEmployees picks StaffDetailPanel, whose footer renders
    // the editor's Save (disabled until the form is dirty; never clicked here).
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("tbody tr").first().click();
    const detailPanel = page.getByRole("dialog", { name: "Staff detail" });
    await expect(detailPanel).toBeVisible({ timeout: 15_000 });
    await expect(detailPanel.getByRole("button", { name: "Save", exact: true })).toHaveCount(1);
    await detailPanel.getByRole("button", { name: "Close detail panel" }).click();
    await expect(detailPanel).toHaveCount(0, { timeout: 15_000 });

    // /schedule: canEditShifts makes every cell an editor entry point, not
    // only the viewer's own row. Escape leaves the draft untouched.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);
    await expect(page.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });
    await scheduledCell(page, "QA Admin", false).first().click();
    const editPanel = page.getByRole("dialog", { name: "Edit shift" });
    await expect(editPanel).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(editPanel).toHaveCount(0, { timeout: 15_000 });

    // /settings?section=org-billing: SettingsPage only honors a requested
    // section the viewer's nav offers, so an admin lands on the default
    // (Labels) and never sees the Subscription content.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings?section=org-billing`);
    await expect(page.getByRole("heading", { name: "Labels", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: "Subscription", exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/Manage billing|Billing activity details|Stripe billing is not configured/),
    ).toHaveCount(0);

    expect(failures).toEqual([]);
  });
});

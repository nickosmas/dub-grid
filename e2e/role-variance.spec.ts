import { expect, test, type Page } from "@playwright/test";
import {
  loginAsQaAccount,
  QA_CALM_HAVEN_ORIGIN,
  QA_MANAGEMENT_EMAIL,
  QA_REGULAR_EMAIL,
} from "./helpers/auth";
import {
  collectUnexpectedRuntimeFailures,
  expectNav,
  expectNoManageControls,
  scheduledCell,
  walkRoutes,
  warmUpAndCaptureEmployeeHref,
} from "./helpers/role-variance";

// 25d2b: the 25d1 route matrix as the non-admin fixtures. The shared walker,
// collector and locators live in helpers/role-variance.ts.

test.describe("role variance: route entry contract", () => {
  test("qa-regular (user, on schedule)", async ({ page }) => {
    test.setTimeout(180_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await walkRoutes(page, [
      {
        // getDashboardRoleVariant() -> "user": the UserDashboard cards.
        path: "/dashboard",
        finalUrl: /\/dashboard$/,
        marker: (p) => p.getByText(/Available shifts|Cover requests/),
      },
      { path: "/schedule", finalUrl: /\/schedule$/, marker: (p) => p.getByRole("grid") },
      { path: "/people", finalUrl: /\/people$/, marker: (p) => p.getByText("Directory") },
      {
        // userViewPermsObj.canViewEmployeeDetails is true: the page renders.
        path: employeeHref,
        finalUrl: new RegExp(`${employeeHref.replace(/\//g, "\\/")}$`),
        marker: (p) => p.getByText("Profile"),
      },
      {
        // On schedule, so the work Overview section is offered.
        path: "/profile",
        finalUrl: /\/profile/,
        marker: (p) => p.getByRole("link", { name: "Overview", exact: true }),
      },
      // canViewReports is false for the user role: ReportsPageContent
      // replaces the route with /dashboard.
      { path: "/reports", finalUrl: /\/dashboard$/ },
      { path: "/alerts", finalUrl: /\/alerts$/, marker: (p) => p.getByText("Inbox") },
      // proxy.ts sends anyone below admin to /schedule before the page renders.
      { path: "/settings", finalUrl: /\/schedule$/ },
    ]);

    await expectNav(page, ["Dashboard", "Schedule", "People"], ["Reports", "Settings"]);
    expect(failures).toEqual([]);
  });

  // The seed puts every login-linked employee on the schedule (a donor's
  // focus areas and cells are cloned onto it), so this fixture is a scheduled
  // user with management access, not a management-only member. The
  // management-only variant (Dashboard bounce, no Overview) has no fixture.
  test("qa-management (user with management access, on schedule)", async ({ page }) => {
    test.setTimeout(180_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_MANAGEMENT_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await walkRoutes(page, [
      {
        path: "/dashboard",
        finalUrl: /\/dashboard$/,
        marker: (p) => p.getByText(/Available shifts|Cover requests/),
      },
      { path: "/schedule", finalUrl: /\/schedule$/, marker: (p) => p.getByRole("grid") },
      {
        // canSeeManagementUsers (isManagementUser): MembersSection renders the
        // roster switcher, a CustomSelect whose trigger reads "On Schedule (N)"
        // and whose closed listbox holds "Management (N)".
        path: "/people",
        finalUrl: /\/people$/,
        marker: (p) => p.getByRole("button", { name: /^On Schedule \(\d+\)$/ }),
      },
      {
        path: employeeHref,
        finalUrl: new RegExp(`${employeeHref.replace(/\//g, "\\/")}$`),
        marker: (p) => p.getByText("Profile"),
      },
      {
        path: "/profile",
        finalUrl: /\/profile/,
        marker: (p) => p.getByRole("link", { name: "Overview", exact: true }),
      },
      { path: "/reports", finalUrl: /\/dashboard$/ },
      { path: "/alerts", finalUrl: /\/alerts$/, marker: (p) => p.getByText("Inbox") },
      { path: "/settings", finalUrl: /\/schedule$/ },
    ]);

    await expectNav(page, ["Dashboard", "Schedule", "People"], ["Reports", "Settings"]);
    expect(failures).toEqual([]);
  });
});

const BOOTSTRAP_PATH = "/api/organization/bootstrap";

/**
 * The same bootstrap loading and recovery assertions people-states.spec.ts
 * and dashboard-states.spec.ts make as the super admin, so the copy is
 * provably role-independent.
 */
async function expectBootstrapStates(page: Page, path: string) {
  // OnboardingGate paints the branded AuthTransitionScreen instead of the
  // page (and its progress bar) while the post-login flag is still set; the
  // effect that clears it can land after the login helper returns.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("dg_auth_transition")), {
      timeout: 15_000,
    })
    .toBeNull();

  await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    // The page fires the bootstrap more than once on load; any copy still in
    // this delay when the next goto starts is aborted by the navigation.
    await route.continue().catch(() => undefined);
  });
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}${path}`);
  await expect(page.locator("[data-progress-bar]"), `${path} loading`).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("[data-progress-bar]"), `${path} loaded`).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.unroute(`**${BOOTSTRAP_PATH}`);

  await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Temporary test failure" }),
    });
  });
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}${path}`);
  await expect(
    page.getByRole("heading", { name: "Loading your workspace" }),
    `${path} recovery`,
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await page.unroute(`**${BOOTSTRAP_PATH}`);
}

/**
 * Everything the collector saw except what the test itself caused: the
 * injected 503 and its console echo, and WebKit's echo for the delayed
 * bootstrap copies the next goto aborts ("connection appears to be offline").
 */
function unexpectedBeyondInducedBootstrapFailure(failures: string[]): string[] {
  return failures.filter(
    (failure) =>
      failure !== `response:503:${BOOTSTRAP_PATH}` &&
      !/Failed to load resource: the server responded with a status of 503/.test(failure) &&
      !/Failed to load resource: The Internet connection appears to be offline/.test(failure),
  );
}

test.describe("role variance: interaction contract", () => {
  test("qa-regular sees read-only people, and only its own schedule cells respond", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);

    // /people: a roster row opens StaffReadOnlyDetailPanel (MembersSection
    // picks it over StaffDetailPanel when canManageEmployees is false), and
    // the page itself has no Add action.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await expect(page.getByText("Directory").first()).toBeVisible({ timeout: 20_000 });
    await expectNoManageControls(page, page);
    await page.locator("tbody tr").first().click();
    const readOnlyPanel = page.getByRole("dialog", { name: "Staff detail" });
    await expect(readOnlyPanel).toBeVisible({ timeout: 15_000 });
    await expectNoManageControls(page, readOnlyPanel);
    await readOnlyPanel.getByRole("button", { name: "Close detail panel" }).click();
    await expect(readOnlyPanel).toHaveCount(0, { timeout: 15_000 });

    // /schedule: openCellEditor only proceeds for the viewer's own row
    // (canOpenOwnShiftDetails / canOpenOwnRequestPanel); any other cell is a
    // no-op, so nothing may open from it.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);
    await expect(page.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });
    const ownCell = scheduledCell(page, "QA Regular", true).first();
    await expect(ownCell, "a published shift in the viewer's own row").toBeVisible({
      timeout: 15_000,
    });
    await ownCell.click();
    // ShiftEditPanel in detail mode (allowShiftEdits false): the viewer's own
    // shift and its request entry points. Its aria-label still says "Edit
    // shift" even here, so match on the rendered content, not the label.
    const ownShiftPanel = page.getByRole("dialog").filter({ hasText: "Shift requests" });
    await expect(ownShiftPanel).toBeVisible({ timeout: 15_000 });
    await expect(ownShiftPanel.getByText("QA Regular")).toBeVisible();
    await expectNoManageControls(page, ownShiftPanel);
    await page.keyboard.press("Escape");
    await expect(ownShiftPanel).toHaveCount(0, { timeout: 15_000 });
    await scheduledCell(page, "QA Regular", false).first().click();
    await page.waitForTimeout(1_000);
    // The cell's hover tooltip is also role="dialog"; only a slide-over is modal.
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);

    // /people/<id>: StaffDetailPage renders ProfileField rows instead of
    // EditEmployeePanel when canEditDetails is false.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}${employeeHref}`);
    await expect(page.getByText("Profile").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Employment", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expectNoManageControls(page, page);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    expect(failures).toEqual([]);
  });

  test("qa-management gets the same read-only surfaces plus the management roster", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const employeeHref = await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_MANAGEMENT_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await expect(page.getByText("Directory").first()).toBeVisible({ timeout: 20_000 });
    await expectNoManageControls(page, page);
    await page.locator("tbody tr").first().click();
    const readOnlyPanel = page.getByRole("dialog", { name: "Staff detail" });
    await expect(readOnlyPanel).toBeVisible({ timeout: 15_000 });
    await expectNoManageControls(page, readOnlyPanel);
    await readOnlyPanel.getByRole("button", { name: "Close detail panel" }).click();
    await expect(readOnlyPanel).toHaveCount(0, { timeout: 15_000 });

    // The management roster: an on-schedule member opens the same read-only
    // panel; a management-only person or pending invite opens the lighter
    // ManagementStaffPanel. Either way, nothing editable for this role.
    await page.getByRole("button", { name: /^On Schedule \(\d+\)$/ }).click();
    await page.getByRole("option", { name: /^Management \(\d+\)$/ }).click();
    await expect(page.getByRole("button", { name: /^Management \(\d+\)$/ })).toBeVisible();
    await expectNoManageControls(page, page);
    await page.locator("tbody tr").first().click();
    const managementPanel = page.getByRole("dialog", {
      name: /^(Staff detail|Management staff detail)$/,
    });
    await expect(managementPanel).toBeVisible({ timeout: 15_000 });
    await expectNoManageControls(page, managementPanel);
    await page.keyboard.press("Escape");
    await expect(managementPanel).toHaveCount(0, { timeout: 15_000 });

    // On the schedule like qa-regular, so the cell contract is the same.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);
    await expect(page.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });
    const ownCell = scheduledCell(page, "QA Management", true).first();
    await expect(ownCell, "a published shift in the viewer's own row").toBeVisible({
      timeout: 15_000,
    });
    await ownCell.click();
    const ownShiftPanel = page.getByRole("dialog").filter({ hasText: "Shift requests" });
    await expect(ownShiftPanel).toBeVisible({ timeout: 15_000 });
    await expect(ownShiftPanel.getByText("QA Management")).toBeVisible();
    await expectNoManageControls(page, ownShiftPanel);
    await page.keyboard.press("Escape");
    await expect(ownShiftPanel).toHaveCount(0, { timeout: 15_000 });
    await scheduledCell(page, "QA Management", false).first().click();
    await page.waitForTimeout(1_000);
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}${employeeHref}`);
    await expect(page.getByText("Profile").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Employment", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expectNoManageControls(page, page);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    expect(failures).toEqual([]);
  });
});

test.describe("role variance: bootstrap states are role-independent", () => {
  test("qa-regular on /people and /dashboard", async ({ page }) => {
    test.setTimeout(180_000);
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await expectBootstrapStates(page, "/people");
    await expectBootstrapStates(page, "/dashboard");

    expect(unexpectedBeyondInducedBootstrapFailure(failures)).toEqual([]);
  });

  test("qa-management on /people", async ({ page }) => {
    test.setTimeout(180_000);
    await warmUpAndCaptureEmployeeHref(page);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_MANAGEMENT_EMAIL, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await expectBootstrapStates(page, "/people");

    expect(unexpectedBeyondInducedBootstrapFailure(failures)).toEqual([]);
  });
});

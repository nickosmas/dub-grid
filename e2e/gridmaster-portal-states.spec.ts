import { expect, test, type Page } from "@playwright/test";
import { loginAsQaGridmaster, QA_GRIDMASTER_ORIGIN } from "./helpers/auth";
import { collectUnexpectedRuntimeFailures } from "./helpers/role-variance";

// 25d3: the /gridmaster route's states as a real gridmaster. The manifest's
// entry (e2e/typography-route-manifest.ts) had browser evidence only for the
// super-admin redirect; this spec evidences the portal itself.

type ViewExpectation = {
  /** Desktop sidebar item, a button named by its label. */
  item: string;
  /** Something only the loaded view renders, inside the content region. */
  marker: (content: ReturnType<Page["getByLabel"]>) => ReturnType<Page["getByText"]>;
};

async function openViews(page: Page, views: ViewExpectation[]) {
  // The header carries its own org chip and search; only the content region
  // says which view is up.
  const content = page.getByLabel("Gridmaster content");
  for (const view of views) {
    await page
      .locator('[data-sidebar="sidebar"]')
      .getByRole("button", { name: view.item, exact: true })
      .click();
    // Views are next/dynamic chunks: the first open of each pays a load.
    await expect(view.marker(content).first(), view.item).toBeVisible({ timeout: 20_000 });
  }
}

test.describe("gridmaster portal states", () => {
  test("renders the dashboard and the oversight views", async ({ page }) => {
    test.setTimeout(180_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaGridmaster(page);

    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(page).not.toHaveURL(/\/(?:schedule|login)/);
    await expect(page.getByRole("button", { name: "All Users", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Gridmaster content").getByText("Platform Oversight")).toBeVisible(
      { timeout: 20_000 },
    );

    await openViews(page, [
      { item: "All Users", marker: (c) => c.getByRole("heading", { name: "All Users" }) },
      { item: "Billing", marker: (c) => c.getByRole("heading", { name: "Billing Oversight" }) },
      {
        item: "Compliance",
        marker: (c) => c.getByRole("heading", { name: "Compliance Oversight" }),
      },
      { item: "Audit Log", marker: (c) => c.getByRole("heading", { name: "Audit log" }) },
      { item: "Alerts", marker: (c) => c.getByText("Inbox") },
      { item: "Security", marker: (c) => c.getByRole("heading", { name: "Security Oversight" }) },
    ]);

    expect(failures).toEqual([]);
  });

  test("renders the tool views and an organization's detail tabs", async ({ page }) => {
    test.setTimeout(180_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaGridmaster(page);
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(page.getByRole("button", { name: "All Users", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await openViews(page, [
      { item: "Impersonation", marker: (c) => c.getByText("1. Select Organization") },
      {
        item: "History",
        marker: (c) => c.getByRole("heading", { name: "Impersonation History" }),
      },
      {
        item: "New Organization",
        marker: (c) => c.getByRole("heading", { name: "Create Organization" }),
      },
      // PlatformFeatureFlagsView has no heading; its first flag row is the marker.
      { item: "Kill Switches", marker: (c) => c.getByText("Error Reporting") },
      {
        item: "Gridmaster Accounts",
        marker: (c) => c.getByRole("heading", { name: "Gridmaster Accounts" }),
      },
    ]);

    // The header search lists organizations as buttons named by org name.
    await page.getByPlaceholder("Search organizations…").first().fill("Calm");
    await page
      .getByRole("button", { name: /^Calm Haven/ })
      .first()
      .click();
    const content = page.getByLabel("Gridmaster content");
    await expect(content.getByText("Support Snapshot")).toBeVisible({ timeout: 20_000 });

    const tabs: [string, (c: typeof content) => ReturnType<Page["getByText"]>][] = [
      ["Overview", (c) => c.getByText("Organization Details")],
      ["Billing", (c) => c.getByRole("heading", { name: "Billing", exact: true })],
      ["Users", (c) => c.getByText("Organization role")],
      ["Employees", (c) => c.getByText("Employee ID")],
      ["Configuration", (c) => c.getByText("Short code")],
      ["Activity", (c) => c.getByRole("heading", { name: "Organization Activity" })],
      ["Invitations", (c) => c.getByText("Expires")],
      ["Schedule", (c) => c.getByText(/No shifts found|Focus area/)],
    ];
    for (const [name, marker] of tabs) {
      await content.getByRole("tab", { name, exact: true }).click();
      await expect(marker(content).first(), `${name} tab`).toBeVisible({ timeout: 20_000 });
    }

    expect(failures).toEqual([]);
  });

  test("shows the top progress bar while the dashboard data is in flight", async ({ page }) => {
    test.setTimeout(120_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaGridmaster(page);
    await page.waitForLoadState("networkidle");

    // GridmasterPortal keeps <ProgressBar loading /> up until dashboardQuery
    // (/api/gridmaster/dashboard) settles; the route's loading.tsx paints the
    // same bar during the segment load.
    await page.route("**/api/gridmaster/dashboard", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue().catch(() => undefined);
    });
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByLabel("Gridmaster content").getByText("Platform Oversight")).toBeVisible(
      { timeout: 20_000 },
    );
    await page.unroute("**/api/gridmaster/dashboard");

    expect(failures).toEqual([]);
  });

  test("shows the inline dashboard error when the dashboard data fails", async ({ page }) => {
    test.setTimeout(120_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaGridmaster(page);
    await page.waitForLoadState("networkidle");

    // A failed dashboardQuery never reaches the route's error.tsx: the portal
    // formats it into an inline message (GridmasterPortal.tsx:455, :1052)
    // and keeps the sidebar usable.
    await page.route("**/api/gridmaster/dashboard", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    });
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(
      page.getByText(/Temporary test failure|We couldn't load the dashboard/),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "All Users", exact: true })).toBeVisible();
    await page.unroute("**/api/gridmaster/dashboard");

    // Only the failure this test injected (and its console echo) may appear.
    const unexpected = failures.filter(
      (failure) =>
        failure !== "response:503:/api/gridmaster/dashboard" &&
        !/responded with a status of 503/.test(failure),
    );
    expect(unexpected).toEqual([]);
  });

  test("shows the not-found boundary for an unknown portal path", async ({ page }) => {
    test.setTimeout(120_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaGridmaster(page);

    // /gridmaster has no dynamic segment and calls notFound() nowhere, so an
    // unknown child path never enters the segment: Next answers it with the
    // app root's boundary, and (app)/gridmaster/not-found.tsx ("Back to
    // Gridmaster") is unreachable (findings F-74). This pins the boundary
    // that actually renders.
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster/does-not-exist`);
    await expect(page.getByText("404", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go Home" })).toBeVisible();
    await expect(page.getByText("Back to Gridmaster")).toHaveCount(0);

    // The 404 document itself is the state under test, not a failure.
    const unexpected = failures.filter(
      (failure) => !/responded with a status of 404/.test(failure),
    );
    expect(unexpected).toEqual([]);
  });
});

import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

const BOOTSTRAP_PATH = "/api/organization/bootstrap";

test.describe("people states", () => {
  test("shows the top progress bar while the organization bootstrap is in flight", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);

    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
  });

  test("shows the bootstrap recovery screen when the organization fails to load", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);

    await expect(page.getByRole("heading", { name: "Loading your organization" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  test("opens and closes the staff detail panel from a roster row", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await page.waitForLoadState("networkidle");

    // MembersSection.tsx's first roster row (on-schedule staff, listed
    // before the management-only table) opens StaffDetailPanel /
    // StaffReadOnlyDetailPanel, both sharing this close button.
    const closeButton = page.getByRole("button", { name: "Close detail panel" });
    await expect(closeButton).toBeHidden();

    await page.locator("tbody tr").first().click();

    await expect(closeButton).toBeVisible({ timeout: 10_000 });

    await closeButton.click();

    await expect(closeButton).toBeHidden();
  });

  test("opens and closes the add-staff dialog", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await page.waitForLoadState("networkidle");

    // A super admin can add both scheduled and management staff, so "Add"
    // opens a menu (MembersSection.tsx:1561-1611) rather than the modal
    // directly (:1613-1618, only when management-adding is unavailable).
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const scheduledStaffItem = page.getByRole("menuitem", { name: "Scheduled staff" });
    if (await scheduledStaffItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await scheduledStaffItem.click();
    }

    await expect(page.getByRole("dialog", { name: /Add Staff Members/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: /Add Staff Members/i })).toBeHidden();
  });

  test("shows the not-found boundary for a malformed person id", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

    // PersonDetailRoute (people/[id]/page.tsx) calls notFound() when the
    // segment isn't a UUID - no data fetch needed to trigger it.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people/not-a-real-id`);

    await expect(page.getByText("Page not found")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("The page you're looking for doesn't exist.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to People" })).toBeVisible();
  });
});

test.describe("person detail states", () => {
  // Finds a detail link that belongs to someone other than the logged-in
  // account: PersonDetailRouteContent (people/[id]/page.tsx) redirects a
  // viewer's own employeeId straight to /profile, and qa-super-admin's own
  // row happens to be the first link on this seeded org's People page.
  async function goToOtherPersonDetail(page: import("@playwright/test").Page): Promise<string> {
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`);
    await page.waitForLoadState("networkidle");
    const personHrefs = await page
      .locator('a[href^="/people/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );
    if (personHrefs.length === 0) {
      throw new Error("The seeded People fixture should expose a detail route");
    }
    for (const href of personHrefs) {
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}${href}`);
      // The self-redirect (if any) fires from a client-side effect after the
      // self lookup resolves, not before the initial navigation settles.
      await page.waitForTimeout(1_000);
      if (new URL(page.url()).pathname !== "/profile") return href;
    }
    throw new Error("Every seeded People link redirected to /profile (self)");
  }

  test("shows the top progress bar while an employee's data is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

    // fetchEmployeeById is one of several actions multiplexed through this
    // one endpoint (features/employees/client/api.ts's requestEmployeeAction),
    // so only that action's requests get delayed - anything else posted here
    // (e.g. a background list refresh) must pass straight through. Registered
    // before discovery too: that also calls fetchEmployeeById, which is fine,
    // it just makes the redirect-check navigations a bit slower.
    await page.route("**/api/employees/manage", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      if (body?.action !== "fetchEmployeeById") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await goToOtherPersonDetail(page);

    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
  });

  test("opens one of the person detail page's action dialogs", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await goToOtherPersonDetail(page);
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });

    // Which action button renders depends on this specific employee's state
    // (has an account yet, already management, already on schedule) - try
    // each of StaffDetailPage.tsx's conditional actions and use whichever
    // one this seeded employee actually shows.
    const candidates = ["Send invitation", "Add to management", "Add to schedule"];
    let opened = false;
    for (const label of candidates) {
      const button = page.getByRole("button", { name: label });
      if (await button.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await button.click();
        opened = true;
        break;
      }
    }
    expect(opened, "expected at least one action button to be visible").toBe(true);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");

    await expect(dialog).toBeHidden();
  });
});

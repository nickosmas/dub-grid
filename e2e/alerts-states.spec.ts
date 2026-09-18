import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

// AlertsInboxPage loads its list through POST /api/notifications/search. The
// header bell uses GET /api/notifications (a different path), so mocking the
// search endpoint leaves the bell untouched.
const SEARCH_PATH = "/api/notifications/search";

test.describe("alerts states", () => {
  test("shows the list placeholder while the inbox search is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(`**${SEARCH_PATH}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/alerts`);

    // ListPlaceholder renders aria-busy="true" while `loadingPage` is set.
    const placeholder = page.locator('main [aria-busy="true"]');
    await expect(placeholder).toBeVisible({ timeout: 15_000 });
    await expect(placeholder).toHaveCount(0, { timeout: 15_000 });

    // The bell's own request must not have been intercepted.
    await expect(page.getByRole("button", { name: /^Alerts/ })).toBeVisible();
  });

  test("shows the error empty state when the inbox search fails", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(`**${SEARCH_PATH}`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/alerts`);

    // AlertsInboxPage's catch sets `error`, rendered as this EmptyState
    // (whose heading is styled text, not an <h*> element).
    await expect(page.getByText("Couldn't load alerts")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Temporary test failure")).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  });

  test("shows the empty inbox state when the search returns nothing", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    // A valid, empty SearchResponse (features/notifications/client/api.ts),
    // so seeded notifications stay untouched.
    await page.route(`**${SEARCH_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [], nextCursor: null, facets: null }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/alerts`);

    await expect(page.getByText("No alerts")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Couldn't load alerts")).toHaveCount(0);
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  });
});

// No route mocks here: the bell row lands on /alerts?open=<id>, and the inbox
// resolves that id through the same search endpoint the tests above stub.
test.describe("alerts from the header bell", () => {
  test("opens the clicked alert on the alerts page", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);

    await page.getByRole("button", { name: /^Alerts/ }).click();
    const popover = page.getByRole("region", { name: "Alerts" });
    await expect(popover).toBeVisible();
    const rows = popover.locator("a[href^='/alerts?open=']");
    const empty = popover.getByText("No alerts");
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 15_000 });
    test.skip(await empty.isVisible(), "the QA inbox holds no alerts to open");

    const title = (await rows.first().innerText()).split("\n")[0]?.trim() ?? "";
    await rows.first().click();

    await expect(page).toHaveURL(/\/alerts$/, { timeout: 20_000 });
    await expect(popover).toBeHidden();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
  });
});

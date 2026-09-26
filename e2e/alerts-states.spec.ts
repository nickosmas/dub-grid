import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";
import { holdRequests } from "./helpers/held-requests";

// AlertsInboxPage loads its list through POST /api/notifications/search. The
// header bell uses GET /api/notifications (a different path), so mocking the
// search endpoint leaves the bell untouched.
const SEARCH_PATH = "/api/notifications/search";

test.describe("alerts states", () => {
  test("shows the list placeholder while the inbox search is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    const releaseSearch = await holdRequests(page, `**${SEARCH_PATH}`);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/alerts`);

    // ListPlaceholder renders aria-busy="true" while `loadingPage` is set.
    const placeholder = page.locator('main [aria-busy="true"]');
    await expect(placeholder).toBeVisible({ timeout: 15_000 });
    releaseSearch();
    await expect(placeholder).toHaveCount(0, { timeout: 15_000 });

    // The header hides the bell on this page on purpose (it would point at
    // the page you are already on), so the check that the mock stayed on the
    // search endpoint is made against the page's own list instead.
    await expect(page.getByRole("button", { name: /^Alerts/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
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

// The bell reads GET /api/notifications. The whole suite shares one server
// and one database, and several specs create alerts as they run (a sign-in
// writes a security alert, a request writes its own), so reading the first
// row's href and then clicking "the first row" sampled two different alerts
// whenever one arrived in between: the click landed on the newcomer's
// subject while the assertion still held the older row's href. The inbox is
// pinned to one alert here so the test measures the contract it is about,
// that a row goes where its href says.
const BELL_PATH = "/api/notifications";
const BELL_ALERT = {
  id: "11111111-2222-4333-8444-555555555555",
  type: "billing_subscription_changed",
  channel: "in_app",
  category: "billing",
  priority: "normal",
  title: "Trial started",
  message: "Your 14-day free trial is now active.",
  metadata: {},
  readAt: null,
  archivedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

test.describe("alerts from the header bell", () => {
  test("goes to the clicked alert's subject", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

    await page.route(`**${BELL_PATH}?*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ notifications: [BELL_ALERT], unreadCount: 1 }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/dashboard`);

    await page.getByRole("button", { name: /^Alerts/ }).click();
    const popover = page.getByRole("region", { name: "Alerts" });
    await expect(popover).toBeVisible();
    // The footer link exists while rows are loading. Pin the seeded alert so
    // this locator cannot switch from "View all" to a row between reads.
    const row = popover.getByRole("link", { name: /^Trial started:/ });
    await expect(row).toBeVisible({ timeout: 15_000 });

    const href = (await row.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/(schedule|people|profile|settings|alerts)/);
    await row.click();

    // The destination drops its own deep-link parameters once applied.
    const path = href.split("?")[0];
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}(\\?.*)?$`), {
      timeout: 20_000,
    });
    await expect(popover).toBeHidden();
  });
});

import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";
import { holdRequests } from "./helpers/held-requests";

// ProfilePage's only data request. fetchSelfProfileData (its single caller in
// the app) appends an orgId query, hence the trailing wildcard.
const SELF_PROFILE_GLOB = "**/api/account/self*";

test.describe("profile states", () => {
  test("shows the top progress bar while the self profile is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    const releaseProfile = await holdRequests(page, SELF_PROFILE_GLOB);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);

    // ProfilePage.tsx renders <ProgressBar loading /> until permissions and
    // the self profile have both resolved.
    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    releaseProfile();
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
  });

  test("shows the self-profile error and recovers on Try again", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(SELF_PROFILE_GLOB, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test failure" }),
      });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);

    // ProfilePage.tsx renders the query's error message with a retry button
    // instead of the page.
    const tryAgain = page.getByRole("button", { name: "Try again" });
    await expect(tryAgain).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Temporary test failure")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit details" })).toHaveCount(0);

    // Lift the failure; the button refetches and the page renders.
    await page.unroute(SELF_PROFILE_GLOB);
    await tryAgain.click();

    await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(tryAgain).toHaveCount(0);
  });

  // Account holds what the sidebar's sections used to, under one heading each,
  // and an old ?section= link opens Account at its heading.
  const ACCOUNT_MARKERS: Record<string, string> = {
    profile: "Your details",
    security: "Sign-in and security",
    notifications: "Alerts",
    "data-privacy": "Data and privacy",
  };

  test("keeps every account section under Account, where old links land", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    for (const [section, heading] of Object.entries(ACCOUNT_MARKERS)) {
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile?section=${section}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({
        timeout: 15_000,
      });
      for (const other of Object.values(ACCOUNT_MARKERS)) {
        await expect(page.getByRole("heading", { name: other, exact: true })).toHaveCount(1);
      }
    }
    await expect(page.getByText("Product updates").first()).toBeVisible();

    // Overview and Schedule hold your own record; Account's sections are not mounted there.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);
    await expect(page.getByRole("button", { name: "Edit details" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Sign-in and security" })).toHaveCount(0);
  });
});

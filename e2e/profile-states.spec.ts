import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

// ProfilePage's only data request. fetchSelfProfileData (its single caller in
// the app) appends an orgId query, hence the trailing wildcard.
const SELF_PROFILE_GLOB = "**/api/account/self*";

test.describe("profile states", () => {
  test("shows the top progress bar while the self profile is in flight", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    await page.route(SELF_PROFILE_GLOB, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile`);

    // ProfilePage.tsx renders <ProgressBar loading /> until permissions and
    // the self profile have both resolved.
    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
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
    // instead of the settings shell.
    const tryAgain = page.getByRole("button", { name: "Try again" });
    await expect(tryAgain).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Temporary test failure")).toBeVisible();
    await expect(page.getByText("Data & privacy")).toHaveCount(0);

    // Lift the failure; the button refetches and the shell renders.
    await page.unroute(SELF_PROFILE_GLOB);
    await tryAgain.click();

    await expect(page.getByText("Data & privacy").first()).toBeVisible({ timeout: 15_000 });
    await expect(tryAgain).toHaveCount(0);
  });

  // ProfilePage.tsx mounts exactly one section panel, chosen from ?section=.
  // "Lazy" here means the other panels are not in the DOM at all, so each
  // case asserts its own marker present and every other marker absent.
  const SECTION_MARKERS: Record<string, string> = {
    profile: "First name",
    security: "Password",
    notifications: "System Notifications",
    "data-privacy": "Cookie preferences",
  };

  test("mounts only the active section's panel", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    for (const [section, marker] of Object.entries(SECTION_MARKERS)) {
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile?section=${section}`);

      await expect(page.getByText(marker, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      for (const [other, otherMarker] of Object.entries(SECTION_MARKERS)) {
        if (other === section) continue;
        await expect(page.locator("main").getByText(otherMarker, { exact: true })).toHaveCount(0);
      }
    }

    // The work overview only exists for viewers who are on the schedule.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/profile?section=overview`);
    await expect(page.getByText("Data & privacy").first()).toBeVisible({ timeout: 15_000 });
    const overviewNav = page.getByRole("link", { name: "Overview", exact: true });
    if ((await overviewNav.count()) > 0) {
      await expect(page.locator("main").getByText("First name", { exact: true })).toHaveCount(0);
    } else {
      // Unknown sections fall back to the default (profile) panel.
      await expect(page.getByText("First name", { exact: true }).first()).toBeVisible();
    }
  });
});

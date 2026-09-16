import { expect, test } from "@playwright/test";
import {
  loginAsQaSuperAdmin,
  waitForClientHydration,
  QA_CALM_HAVEN_ORIGIN,
  QA_SUPER_ADMIN_EMAIL,
  QA_SUPER_ADMIN_PASSWORD,
} from "./helpers/auth";

const BOOTSTRAP_PATH = "/api/organization/bootstrap";

test.describe("dashboard states", () => {
  test("shows the top progress bar while the organization bootstrap is in flight", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    const navigation = loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });

    await navigation;

    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("renders each card's empty state when there are no coverage requirements", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    // Coverage and open-shift cards both derive from coverageRequirements
    // (CoverageBySectionCard.tsx, DashboardView.tsx's openShifts memo), so
    // zeroing it out of a real bootstrap response exercises both cards'
    // empty states from one intercept, without inventing a synthetic
    // response shape that could drift from the real one.
    await page.route(`**${BOOTSTRAP_PATH}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.coverageRequirements = [];
      await route.fulfill({ response, json: body });
    });

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/dashboard`);

    // The exact title depends on this org's current publish state (not
    // something this test controls), so match any of OpenShiftsCard's three
    // known empty-state titles rather than assuming one.
    await expect(
      page.getByText(/Not published yet|No open shifts on published dates|All shifts covered/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Set up coverage requirements in Settings/i)).toBeVisible();
  });

  test("shows the trial welcome overlay and dismisses it", async ({ page }) => {
    test.setTimeout(60_000);

    let shouldShowWelcome = true;
    await page.route("**/api/trial-welcome", async (route) => {
      if (route.request().method() === "POST") {
        shouldShowWelcome = false;
        await route.fulfill({ json: { success: true } });
        return;
      }
      await route.fulfill({
        json: {
          shouldShowWelcome,
          trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    });

    // loginAsQaSuperAdmin's own overlay-clearing step dismisses any open
    // Modal (including this one) via its generic "Close modal" button before
    // this test could assert on it, so this logs in directly instead - the
    // seeded qa-super-admin account is already past the one-time terms and
    // setup-wizard gates that helper also handles, in every environment this
    // suite runs in.
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/login`);
    await waitForClientHydration(page);
    await page.getByLabel("Email").fill(QA_SUPER_ADMIN_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await expect(page.getByText("Your trial has started!")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/days left|Your trial is active/)).toBeVisible();

    await page.getByRole("button", { name: "Maybe later" }).click();

    await expect(page.getByText("Your trial has started!")).toBeHidden();
  });
});

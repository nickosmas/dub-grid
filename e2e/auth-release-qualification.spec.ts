import { expect, test, type Page } from "@playwright/test";
import {
  clearBlockingOverlays,
  loginAsQaAccount,
  loginAsQaSuperAdmin,
  QA_CALM_HAVEN_ORIGIN,
  QA_INACTIVE_EMAIL,
  QA_MANAGEMENT_EMAIL,
  QA_MFA_EMAIL_BY_BROWSER,
  QA_REGULAR_EMAIL,
  QA_SUPER_ADMIN_PASSWORD,
  waitForClientHydration,
} from "./helpers/auth";
import {
  clearLocalMfaFactors,
  enrollLocalTotp,
  generateLocalTotp,
  setLocalOrganizationSubscription,
} from "./helpers/local-auth-state";
import { isKnownBenignConsoleNoise, isKnownBenignResponsePath } from "./helpers/runtime-noise";

function collectUnexpectedRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isKnownBenignConsoleNoise(message.text())) {
      failures.push(`console:${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 500 && !isKnownBenignResponsePath(path)) {
      failures.push(`response:${response.status()}:${path}`);
    }
  });
  return failures;
}

test.describe("authentication release qualification", () => {
  test("redirects a signed-out visitor away from Calm Haven tenant data", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/dashboard`);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("admits an active regular user to Calm Haven without onboarding", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await expect(page).toHaveURL(/calmhaven\.localhost:\d+\/(?:dashboard|schedule)/);
    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("admits an active management user to the same Calm Haven shell", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_MANAGEMENT_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await expect(page).toHaveURL(/calmhaven\.localhost:\d+\/(?:dashboard|schedule)/);
    await expect(page).not.toHaveURL(/\/onboarding/);
    await expect(page.getByRole("link", { name: "People" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("redirects a regular user away from admin-only settings", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings`);

    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    expect(failures).toEqual([]);
  });

  test("keeps an inactive account read-only without replaying onboarding", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/login`);
    await waitForClientHydration(page);
    await page.getByLabel("Email").fill(QA_INACTIVE_EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign In" }).click();

    const termsHeading = page.getByRole("heading", { name: "Updated Terms of Service" });
    const inactiveBanner = page.getByText(
      "Your account is inactive. Ask an admin to reactivate you to regain full access.",
    );
    await Promise.race([
      termsHeading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
      inactiveBanner.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
    ]);
    if (await termsHeading.isVisible()) {
      await page.getByLabel("Terms of Service content").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.getByRole("button", { name: "Accept & Continue" }).click();
    }

    await expect(inactiveBanner).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Skip setup" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    expect(failures).toEqual([]);
  });

  test("does not replay onboarding after a super admin is admitted", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/dashboard`);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("button", { name: "Skip setup" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("admits a regular user immediately after a local billing hold is cleared", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const failures = collectUnexpectedRuntimeFailures(page);
    await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);
    const previousStatus = await setLocalOrganizationSubscription("calmhaven", "canceled");

    try {
      const heldStatus = await page.evaluate(async () => {
        const response = await fetch("/api/organization/access-status", { cache: "no-store" });
        return response.json() as Promise<{ available: boolean; state: string }>;
      });
      expect(heldStatus).toEqual({ available: false, state: "unavailable" });

      // The gate route forces the middleware access cache to reconcile with
      // the database, matching the manual Check again flow below.
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/billing-required`);
      await expect(page).toHaveURL(/\/billing-required/);
      await expect(page.getByRole("heading", { name: "Organization unavailable" })).toBeVisible();
      await expect(page.getByText("This organization is currently unavailable.")).toBeVisible();

      await setLocalOrganizationSubscription("calmhaven", "active");
      await page.getByRole("button", { name: "Check again" }).click();
      await expect(page).toHaveURL(/\/schedule/, { timeout: 15_000 });
      await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    } finally {
      await setLocalOrganizationSubscription("calmhaven", previousStatus);
      // Do not leak the held access answer into the next matrix row when an
      // assertion above fails before the manual recheck can refresh it.
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/billing-required`).catch(() => undefined);
    }

    expect(failures).toEqual([]);
  });

  test("requires and accepts TOTP for an enrolled super admin", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const browserName = testInfo.project.name as keyof typeof QA_MFA_EMAIL_BY_BROWSER;
    const email = QA_MFA_EMAIL_BY_BROWSER[browserName];
    if (!email) throw new Error(`No MFA qualification identity for ${testInfo.project.name}`);
    const failures = collectUnexpectedRuntimeFailures(page);
    const { secret } = await enrollLocalTotp(email, QA_SUPER_ADMIN_PASSWORD);

    try {
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}/login`);
      await waitForClientHydration(page);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("textbox", { name: "Password" }).fill(QA_SUPER_ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();

      await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
      await page.getByPlaceholder("000000").fill(generateLocalTotp(secret));
      await page.getByRole("button", { name: "Verify" }).click();

      const termsHeading = page.getByRole("heading", { name: "Updated Terms of Service" });
      const dashboardLink = page.getByRole("link", { name: "Dashboard" });
      await Promise.race([
        termsHeading.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
        dashboardLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
      ]);
      if (await termsHeading.isVisible()) {
        await page.getByLabel("Terms of Service content").evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await page.getByRole("button", { name: "Accept & Continue" }).click();
      }

      const skipSetupButton = page.getByRole("button", { name: "Skip setup" });
      await Promise.race([
        skipSetupButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
        dashboardLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {}),
      ]);
      if (await skipSetupButton.isVisible()) {
        await clearBlockingOverlays(page);
        await skipSetupButton.click();
        await page.getByRole("button", { name: "Skip", exact: true }).click();
        await page.waitForLoadState("load");
      }
      await clearBlockingOverlays(page);

      await expect(page).toHaveURL(/calmhaven\.localhost:\d+\/(?:dashboard|schedule)/);
      await expect(dashboardLink).toBeVisible();
    } finally {
      await clearLocalMfaFactors(email);
    }

    expect(failures).toEqual([]);
  });
});

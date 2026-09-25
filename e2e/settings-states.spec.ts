import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";
import { holdRequests } from "./helpers/held-requests";

const BOOTSTRAP_PATH = "/api/organization/bootstrap";

test.describe("settings states", () => {
  test("shows the settings skeleton while the organization bootstrap is in flight", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.waitForLoadState("networkidle");

    const releaseBootstrap = await holdRequests(page, `**${BOOTSTRAP_PATH}`);

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings`);

    // settings/page.tsx renders SettingsPageSkeleton (aria-busy, labelled
    // "Loading settings") plus the top progress bar until the bootstrap lands.
    const skeleton = page.getByLabel("Loading settings");
    await expect(skeleton).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toBeVisible();
    releaseBootstrap();

    await expect(skeleton).toHaveCount(0, { timeout: 15_000 });
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

    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings`);

    // settings/page.tsx: `loadError && !org` renders OrganizationBootstrapRecovery.
    await expect(page.getByRole("heading", { name: "Loading your workspace" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
    await expect(page.getByLabel("Loading settings")).toHaveCount(0);
  });

  test("opens and cancels an absence type's archive confirm dialog", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings?section=schedule-absence-types`);
    await page.waitForLoadState("networkidle");

    // AbsenceTypes.tsx (same editor pattern as Indicators.tsx, which the QA
    // org has no rows for): each row is a button with aria-expanded that
    // opens the inline editor; its Archive action checks dependencies, then
    // opens a ConfirmDialog (archive when referenced, delete when not).
    // Cancelling mutates nothing.
    // The settings shell renders no <main>; rows carry the dg-list-row class.
    const firstRow = page.locator(".dg-list-row").first();
    const rowToggle = firstRow.locator("button[aria-expanded]");
    await expect(rowToggle).toBeVisible({ timeout: 15_000 });
    const rowText = (await rowToggle.innerText()).trim();
    await rowToggle.click();

    await page.getByRole("button", { name: "Archive", exact: true }).click();

    // ConfirmDialog title: `Archive "<name>"?` (or `Delete "<name>"?` when
    // nothing references the type).
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText(/(Archive|Delete) ".+"\?/);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(firstRow).toContainText(rowText.split("\n")[0]);
  });
});

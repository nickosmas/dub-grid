import { expect, test, type Page } from "@playwright/test";
import {
  loginAsQaAccount,
  QA_ADMIN_EMAIL,
  QA_CALM_HAVEN_ORIGIN,
  QA_MANAGEMENT_EMAIL,
  QA_REGULAR_EMAIL,
  QA_SUPER_ADMIN_EMAIL,
} from "./helpers/auth";
import { warmUpAndCaptureEmployeeHref } from "./helpers/role-variance";

// 40e3: the matrix's narrow viewport. The narrow projects (390 by 844) run
// only these @narrow tests; each role's main surfaces must fit the width and
// keep the navigation reachable through the menu.

async function expectFitsWidth(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "horizontal scroll").toBeLessThanOrEqual(1);
}

/**
 * At phone width the cookie banner sits over the bottom of the screen, where
 * the terms card's Accept button is; a person answers it first, so the spec
 * does too, with the privacy-safe choice.
 */
async function answerCookieBanner(page: Page) {
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}/login`);
  const essentialOnly = page.getByRole("button", { name: "Essential only" });
  await essentialOnly.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
  if (await essentialOnly.isVisible()) await essentialOnly.click();
}

async function expectSignedInSurfaces(page: Page, email: string) {
  // The shared sign-in waits for the desktop navigation, so sign in wide and
  // check the surfaces at the project's phone width. On a fresh database only
  // a super admin's first sign-in opens the organization to everyone else.
  const narrow = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 800 });
  await warmUpAndCaptureEmployeeHref(page);
  await answerCookieBanner(page);
  await loginAsQaAccount(page, email, QA_CALM_HAVEN_ORIGIN);
  if (narrow) await page.setViewportSize(narrow);
  for (const path of ["/dashboard", "/schedule"]) {
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}${path}`);
    const menu = page.getByRole("button", { name: "Open menu" });
    await expect(menu, `${path} menu`).toBeVisible({ timeout: 30_000 });
    await expectFitsWidth(page);
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(menu.getByRole("button", { name: /^Schedule/ })).toBeVisible({ timeout: 15_000 });
}

test.describe("narrow viewport @narrow", () => {
  test("signed out: the landing page fits", async ({ page }) => {
    await page.goto(QA_CALM_HAVEN_ORIGIN.replace("calmhaven.", ""));
    await expect(page.locator("body")).toBeVisible();
    await expectFitsWidth(page);
  });

  for (const [role, email] of [
    ["user", QA_REGULAR_EMAIL],
    ["management-only user", QA_MANAGEMENT_EMAIL],
    ["admin", QA_ADMIN_EMAIL],
    ["super admin", QA_SUPER_ADMIN_EMAIL],
  ] as const) {
    test(`${role}: dashboard and schedule fit, and the menu opens`, async ({ page }) => {
      test.setTimeout(120_000);
      await expectSignedInSurfaces(page, email);
    });
  }
});

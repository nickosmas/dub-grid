import { expect, test, type Page } from "@playwright/test";
import {
  loginAsQaAccount,
  loginAsQaGridmaster,
  loginAsQaSuperAdmin,
  QA_ADMIN_EMAIL,
  QA_CALM_HAVEN_ORIGIN,
  QA_GRIDMASTER_ORIGIN,
} from "./helpers/auth";
import { isKnownBenignConsoleNoise, isKnownBenignResponsePath } from "./helpers/runtime-noise";

// Same collector auth-release-qualification.spec.ts keeps locally.
function collectUnexpectedRuntimeFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !isKnownBenignConsoleNoise(message.text())) {
      failures.push(`console:${message.text()}`);
    }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    // 403s are recorded too: a role fixture calling an endpoint its role is
    // not allowed to use is exactly the contract drift these fixtures exist
    // to surface, and the console line alone doesn't name the path.
    if (
      (response.status() >= 500 || response.status() === 403) &&
      !isKnownBenignResponsePath(path)
    ) {
      failures.push(`response:${response.status()}:${path}`);
    }
  });
  return failures;
}

// Smoke coverage for the two role fixtures added for 25d2 (admin tier and a
// platform gridmaster), so the role-variance matrix can rely on them.
test.describe("role fixtures", () => {
  test("qa-admin lands in the Calm Haven shell with Settings access", async ({ page }) => {
    // On a freshly seeded database the org's trial only starts on a super
    // admin's first login; before that every other member is held at
    // /billing-required. Start it, then sign in as the admin.
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.context().clearCookies();
    // Leave the super admin's page (and its polling) behind before collecting
    // failures, so a request cut off by the cookie clear can't be misread as
    // an admin-session failure.
    await page.goto("about:blank");
    const failures = collectUnexpectedRuntimeFailures(page);

    await loginAsQaAccount(page, QA_ADMIN_EMAIL, QA_CALM_HAVEN_ORIGIN);

    await expect(page).toHaveURL(/calmhaven\.localhost:\d+\/(?:dashboard|schedule)/);
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    // Header.tsx shows Settings for role === "admin" && canAccessSettings.
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("qa-gridmaster lands on the platform portal", async ({ page }) => {
    const failures = collectUnexpectedRuntimeFailures(page);

    await loginAsQaGridmaster(page);

    await expect(page).toHaveURL(new RegExp(`^${QA_GRIDMASTER_ORIGIN.replace(/\./g, "\\.")}/`));
    await expect(page.getByRole("button", { name: "All Users" })).toBeVisible();

    // The manifest's /gridmaster entry only evidences the non-gridmaster
    // redirect; a real gridmaster renders the portal there.
    await page.goto(`${QA_GRIDMASTER_ORIGIN}/gridmaster`);
    await expect(page).not.toHaveURL(/\/(?:schedule|login)/);
    await expect(page.getByRole("button", { name: "All Users" })).toBeVisible({ timeout: 15_000 });
    expect(failures).toEqual([]);
  });
});

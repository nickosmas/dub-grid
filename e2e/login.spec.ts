import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

test("a super admin can sign in and lands on an authenticated page", async ({ page }) => {
  await loginAsQaSuperAdmin(page);

  // Login always redirects away from /login toward the org's dashboard/schedule.
  await expect(page).not.toHaveURL(/\/login/);
});

test("an invalid password is rejected with an inline error, not a redirect", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("qa-super-admin@dubgrid.test");
  await page.getByRole("textbox", { name: "Password" }).fill("definitely-the-wrong-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  // The copy sweep replaced the raw "Invalid email or password" with wording
  // that says what to do about it. Still deliberately generic: naming which of
  // the two was wrong would confirm whether an account exists.
  await expect(page.getByText(/check your email and password and try again/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

// This is the regression net for edge middleware silently not running.
//
// From the monorepo refactor until 2026-08-25, middleware.ts sat one directory
// above the `src/` Next.js reads when the app lives at `src/app`, so it was
// never invoked. Nothing failed: Next still emitted a middleware-manifest
// naming it, it type-checked, and all 42 cases in middleware.test.ts passed —
// they import the module and call it directly, exercising the logic while never
// touching the wiring. Only a real request over HTTP can tell the difference,
// which makes this the cheapest test that could have caught it.
test("a signed-out visitor is redirected away from a protected route", async ({ page }) => {
  await page.context().clearCookies();

  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});

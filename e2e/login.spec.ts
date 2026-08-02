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

  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

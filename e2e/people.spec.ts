import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

// Thin smoke check, not full People CRUD coverage — see schedule.spec.ts's
// comment for the rationale (deriving stable selectors for the roster
// table/forms needs a live environment pass). This catches "the People route
// is broken/misconfigured" class failures.
test("an authenticated admin can open the People roster", async ({ page }) => {
  await loginAsQaSuperAdmin(page);

  await page.getByRole("link", { name: "People" }).click();

  await expect(page).toHaveURL(/\/people/);
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();
});

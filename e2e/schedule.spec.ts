import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

// Deliberately a thin smoke check, not a full edit-and-publish walkthrough —
// see PR discussion / production-readiness audit follow-up: the grid's cell
// interactions are complex enough that scripting them reliably needs its own
// pass with a live environment to derive stable selectors against. This test
// exists to catch "the schedule route is broken/misconfigured" class
// failures (auth gate misfires, a server error on render, etc.).
test("an authenticated admin can open the schedule grid", async ({ page }) => {
  await loginAsQaSuperAdmin(page);

  // exact: true — the dashboard also has an "Open schedule" CTA and a
  // "Schedule published X ago" link, both of which substring-match "Schedule".
  await page.getByRole("link", { name: "Schedule", exact: true }).click();

  await expect(page).toHaveURL(/\/schedule/);
  // Confirms the authenticated shell is still mounted (i.e. we weren't
  // silently bounced back to /login by a broken auth check).
  await expect(page.getByRole("link", { name: "Schedule", exact: true })).toBeVisible();
});

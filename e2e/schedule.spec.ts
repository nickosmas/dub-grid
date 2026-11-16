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

// Month view once crashed on open (a period key read the first visible date,
// and Month has none), and no test switched to it.
test("the schedule opens in Month view", async ({ page }) => {
  await loginAsQaSuperAdmin(page);
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule/);

  await page.getByRole("button", { name: /^(1 Week|2 Weeks)$/ }).click();
  await page.getByRole("option", { name: "Month" }).click();

  await expect(page.getByText(/^[A-Z][a-z]+ \d{4}$/).first()).toBeVisible();
  await expect(page.getByText("This page didn't load")).toHaveCount(0);

  // A day opens its panel, and the panel leads to the week where it's edited.
  await page.getByRole("button", { name: /, today,/ }).click();
  const panel = page.getByRole("region", { name: /details$/ });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Open this week" }).click();
  await expect(page.getByRole("button", { name: "1 Week", exact: true })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { loginAsQaAccount, QA_CALM_HAVEN_ORIGIN, QA_REGULAR_EMAIL } from "./helpers/auth";

// Firefox cancels a page's in-flight requests as soon as a navigation away
// from it starts. The session check was one of them, and reading the
// cancellation as signed-out sent a redirect to /login over the top of the
// navigation (NS_BINDING_ABORTED). Chromium and WebKit keep the old page's
// requests alive, so only Firefox can show it.
test("leaving a page while its session check is in flight keeps the navigation", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "firefox", "Only Firefox cancels the leaving page's requests");
  await loginAsQaAccount(page, QA_REGULAR_EMAIL, QA_CALM_HAVEN_ORIGIN);
  await page.waitForLoadState("networkidle");

  let sessionCheckStarted = false;
  await page.route("**/auth/v1/user", async (route) => {
    sessionCheckStarted = true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue().catch(() => undefined);
  });
  await page.goto(`${QA_CALM_HAVEN_ORIGIN}/people`, { waitUntil: "commit" });
  await expect.poll(() => sessionCheckStarted, { timeout: 15_000 }).toBe(true);

  await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);

  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible({ timeout: 15_000 });
});

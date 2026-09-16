import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

test.describe("schedule states", () => {
  test("shows the top progress bar while navigating to Schedule client-side", async ({ page }) => {
    test.setTimeout(60_000);

    // loading.tsx (the route's Suspense fallback) only shows during a
    // client-side navigation - Next's router requests the segment's RSC
    // payload as a real HTTP request (GET /schedule?_rsc=<hash>, confirmed
    // by inspecting the network tab). A hard page.goto wouldn't exercise it
    // at all - there's no client router yet to show a fallback.
    //
    // Delaying just that one URL with page.route is not enough: the
    // "Schedule" nav Link prefetches the same RSC payload speculatively as
    // soon as it mounts, well before the click below, and caches the result
    // in Next's client-side Router Cache - a JS-level cache that ignores
    // HTTP cache-control headers entirely. Whichever request (the prefetch
    // or the click) happens to run first "uses up" a route handler, and the
    // other is served from that in-memory cache with no new network
    // activity to intercept - flaky depending on timing (confirmed: 2 of 3
    // manual runs failed with that approach). Throttling the whole
    // connection via CDP instead keeps the prefetch itself slow enough that
    // it hasn't resolved by the time of the click either way.
    const cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send("Network.enable");
    await cdpSession.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1_500,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);

    await page.getByRole("link", { name: "Schedule", exact: true }).click();

    await expect(page.locator("[data-progress-bar]")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/schedule/, { timeout: 15_000 });
    await expect(page.locator("[data-progress-bar]")).toHaveCount(0, { timeout: 15_000 });
  });

  test("opens and closes the Tools menu's Print dialog", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/schedule`);
    await page.waitForLoadState("networkidle");

    // exact: true - Next.js's own dev-tools button's accessible name ("Open
    // Next.js Dev Tools") also contains "Tools" as a substring match.
    const toolsButton = page.getByRole("button", { name: "Tools", exact: true });
    await expect(toolsButton).toBeVisible({ timeout: 15_000 });
    await toolsButton.click();
    await page.getByRole("menuitem", { name: "Print" }).click();

    await expect(page.getByRole("dialog", { name: /print/i })).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog", { name: /print/i })).toBeHidden();
  });
});

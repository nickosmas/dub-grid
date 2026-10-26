import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// `dg-theme` is exempt from cookie consent only as a record of a choice the
// visitor made, so nothing may write it (or the stored theme it seeds) before
// they pick one. Cookiebot's prior-consent scan flagged it when it did.
const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexURL = `http://${baseDomain}:${port}/`;
// Served from disk as landing.spec does: resizing the landing screenshots on a
// loaded runner kept WebKit's load event waiting past the test timeout, and
// held up the next spec's visit to the same page.
const LANDING_IMAGE_PATH = /^\/landing\/screenshots\/[a-z-]+\.png$/;

test.beforeEach(async ({ page }) => {
  await page.route("**/_next/image?**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    if (!source || !LANDING_IMAGE_PATH.test(source)) {
      await route.continue();
      return;
    }
    await route.fulfill({ path: `apps/web/public${source}` });
  });
});

/** The toggle's icon renders only after mount, so its effects (and any cookie write) have run. */
async function waitForHydratedToggle(page: Page) {
  await expect(
    page
      .getByRole("button", { name: /^Theme:/ })
      .first()
      .locator("svg"),
  ).toBeVisible();
}

async function themeCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === "dg-theme");
}

test("a visitor who never picks a theme gets no theme cookie or stored theme", async ({
  page,
  context,
}) => {
  await page.goto(apexURL, { waitUntil: "domcontentloaded" });
  await waitForHydratedToggle(page);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("form").first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

  expect(await themeCookie(context)).toBeUndefined();
});

test("picking a theme writes the shared theme cookie", async ({ page, context }) => {
  await page.goto(apexURL, { waitUntil: "domcontentloaded" });
  await waitForHydratedToggle(page);
  await page.getByRole("button", { name: "Theme: light. Switch to dark mode." }).first().click();

  await expect.poll(async () => (await themeCookie(context))?.value).toBe("dark");
});

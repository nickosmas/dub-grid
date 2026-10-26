import { expect, test, type BrowserContext } from "@playwright/test";

// `dg-theme` is exempt from cookie consent only as a record of a choice the
// visitor made, so nothing may write it (or the stored theme it seeds) before
// they pick one. Cookiebot's prior-consent scan flagged it when it did.
const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexURL = `http://${baseDomain}:${port}/`;

async function themeCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === "dg-theme");
}

test("a visitor who never picks a theme gets no theme cookie or stored theme", async ({
  page,
  context,
}) => {
  await page.goto(apexURL);
  await expect(page.getByRole("button", { name: /^Theme:/ }).first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

  await page.goto("/login");
  await expect(page.locator("form").first()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

  expect(await themeCookie(context)).toBeUndefined();
});

test("picking a theme writes the shared theme cookie", async ({ page, context }) => {
  await page.goto(apexURL);
  await page.getByRole("button", { name: "Theme: light. Switch to dark mode." }).first().click();

  await expect.poll(async () => (await themeCookie(context))?.value).toBe("dark");
});

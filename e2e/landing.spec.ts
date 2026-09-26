import { expect, test } from "@playwright/test";

// Marketing pages render on the canonical apex. This explicit target keeps the
// test independent of whichever origin authenticated-flow tests use.
const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexURL = `http://${baseDomain}:${port}/`;
// next/image resizes each large screenshot on its first request, and on a
// loaded CI runner that has taken longer than the default 5s poll (four of six
// requests still pending in a failed run). Production serves them from cache.
const IMAGE_POLL = { timeout: 30_000 } as const;
const screenshotAlts = [
  "Calm Haven's two-week staff schedule in DubGrid",
  "Calm Haven's scheduling dashboard with coverage and shift summaries",
  "Calm Haven's team directory in DubGrid",
] as const;

test("landing page renders the public DubGrid surface", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(apexURL);

  await expect(page).toHaveTitle(/DubGrid/);
  await expect(
    page.getByRole("heading", { name: "Scheduling, done right. Ditch the spreadsheet." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request Demo" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "See Features" })).toBeVisible();

  for (const alt of screenshotAlts) {
    const screenshot = page.getByAltText(alt);
    await screenshot.evaluate((image) => image.scrollIntoView({ block: "center" }));
    await expect(screenshot).toBeVisible();
    await expect
      .poll(
        () =>
          screenshot.evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        IMAGE_POLL,
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          screenshot.evaluate((image) =>
            image instanceof HTMLImageElement
              ? new URL(image.currentSrc).searchParams.get("q")
              : null,
          ),
        IMAGE_POLL,
      )
      .toBe("95");
  }

  await expect(page.locator(".landing-screenshot").first()).toHaveCSS("border-top-width", "8px");
  await expect(page.locator(".landing-screenshot").first()).toHaveCSS(
    "border-top-color",
    "rgb(255, 255, 255)",
  );

  await expect(page.locator(".landing-cta")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".landing-cta")).toHaveCSS("box-shadow", "none");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test.describe("landing page at mobile width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the hero controls and screenshot assets within the viewport", async ({ page }) => {
    await page.goto(apexURL);

    await expect(
      page.getByRole("heading", { name: "Scheduling, done right. Ditch the spreadsheet." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Request Demo" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Theme:/ })).toBeVisible();
    await expect(page.getByAltText(screenshotAlts[0])).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Security that stays out of your way" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});

test("landing header and hero stay readable in dark mode", async ({ page }) => {
  test.setTimeout(120_000);
  // The app intentionally defaults new visitors to light mode. Set the same
  // explicit preference a user creates with the theme control; emulating a
  // dark operating-system scheme alone must not override that default.
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(apexURL);

  await expect(page.locator(".landing-nav")).toBeVisible();
  await expect(page.locator(".landing-hero h1")).toBeVisible();
  await expect(page.getByRole("button", { name: /Theme:/ })).toBeVisible();

  for (const alt of screenshotAlts) {
    const screenshot = page.getByAltText(alt);
    await screenshot.evaluate((image) => image.scrollIntoView({ block: "center" }));
    await expect
      .poll(
        () =>
          screenshot.evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              decodeURIComponent(image.currentSrc).includes("-dark"),
          ),
        IMAGE_POLL,
      )
      .toBe(true);
  }

  await expect(page.locator(".landing-screenshot").first()).toHaveCSS("border-top-width", "8px");
  await expect(page.locator(".landing-screenshot").first()).toHaveCSS(
    "border-top-color",
    "rgb(59, 66, 82)",
  );

  await expect(page.locator(".landing-hero-gradient")).toHaveCSS(
    "background-image",
    "linear-gradient(rgb(29, 58, 160) 0%, rgb(11, 45, 117) 38%, rgb(7, 21, 53) 68%, rgb(5, 6, 9) 100%)",
  );
});

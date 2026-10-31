import { expect, test } from "@playwright/test";

// Marketing pages render on the canonical apex. This explicit target keeps the
// test independent of whichever origin authenticated-flow tests use.
const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexURL = `http://${baseDomain}:${port}/`;
// Every picture on the page is drawn in code, the hero's schedule included.
const heroSchedule = "A two-week staff schedule in DubGrid";
const illustrationSections = [
  ["Stop building schedules by hand", /Generate schedule fills next week/],
  ["Never get caught short-staffed", /open evening shift is filled/],
  ["No more swap texts and sticky notes", /Jordan accepts Sam's swap/],
  ["No more “nobody told me”", /schedule for Tuesday changed/],
  ["Catch overtime before it happens", /nobody goes over 40/],
  ["The right people make the right changes", /billing stays with Super Admins/],
] as const;

test("landing page renders the public DubGrid surface", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(apexURL);

  await expect(page).toHaveTitle(/DubGrid/);
  await expect(
    page.getByRole("heading", { name: "Scheduling, done right. Ditch the spreadsheet." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request Demo" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "See how it works" })).toBeVisible();

  await expect(page.getByRole("img", { name: heroSchedule })).toBeVisible();

  await expect(page.locator(".landing-screenshot").first()).toHaveCSS("border-top-width", "8px");
  await expect(page.locator(".landing-screenshot").first()).toHaveCSS(
    "border-top-color",
    "rgb(255, 255, 255)",
  );

  for (const [heading, illustration] of illustrationSections) {
    const section = page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name: heading }),
    });
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("img", { name: illustration })).toBeVisible();
  }

  const security = page.locator("#security");
  await security.scrollIntoViewIfNeeded();
  // Wide enough for every card in one row, so there is nothing to page through.
  await expect(security.getByRole("listitem")).toHaveCount(5);
  for (const card of await security.getByRole("listitem").all()) {
    await expect(card).toBeInViewport({ ratio: 1 });
  }
  await expect(security.getByRole("button", { name: "Next" })).toHaveCount(0);

  await expect(page.locator(".landing-cta")).toHaveCSS(
    "background-image",
    /linear-gradient\(140deg, rgb\(11, 45, 117\)/,
  );

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test.describe("landing page at mobile width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the hero controls, screenshot and illustrations within the viewport", async ({
    page,
  }) => {
    await page.goto(apexURL);

    await expect(
      page.getByRole("heading", { name: "Scheduling, done right. Ditch the spreadsheet." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Request Demo" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Theme:/ })).toBeVisible();
    await expect(page.getByRole("img", { name: heroSchedule })).toBeVisible();
    for (const [heading] of illustrationSections) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Your team's information stays protected" }),
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

  await expect(page.getByRole("img", { name: heroSchedule })).toBeVisible();
  await expect(page.locator('.hero-sched-chip[data-kind="day"]').first()).toHaveCSS(
    "color",
    "rgb(165, 243, 252)",
  );

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

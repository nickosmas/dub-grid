import { expect, test } from "@playwright/test";

// Marketing pages render on the canonical apex. This explicit target keeps the
// test independent of whichever origin authenticated-flow tests use.
const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexURL = `http://${baseDomain}:${port}/`;

test("landing page renders the public DubGrid surface", async ({ page }) => {
  await page.goto(apexURL);

  await expect(page).toHaveTitle(/DubGrid/);
  await expect(
    page.getByRole("heading", { name: "Scheduling, done right. Ditch the spreadsheet." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request Demo" }).first()).toBeVisible();
});

import { expect, test } from "@playwright/test";

// Marketing pages only render on the apex domain — middleware redirects any
// subdomain back to it (see middleware.ts). The shared Playwright baseURL is
// tenant-subdomain-scoped for authenticated-flow tests, so this test targets
// the apex explicitly instead of relying on that redirect.
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

import { expect, test } from "@playwright/test";

test("landing page renders the public DubGrid surface", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/DubGrid/);
  await expect(
    page.getByText("DubGrid replaces spreadsheets", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule Management" })).toBeVisible();
});

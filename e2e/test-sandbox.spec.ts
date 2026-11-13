import { expect, test, type Page } from "@playwright/test";
import { clearBlockingOverlays, loginAsQaSuperAdmin } from "./helpers/auth";

// The Test Sandbox end to end as the seeded Super Admin: the banner shows and
// Exit leaves it (User view included), and a second session asks before
// replacing the first one's sandbox, which then says why it ended (F-219).
// Serial: a person has one sandbox at a time.
test.describe.configure({ mode: "serial" });

const banner = (page: Page) => page.getByRole("status", { name: "You're in sandbox mode" });

async function enterSandbox(page: Page) {
  await clearBlockingOverlays(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Test sandbox" }).click();
  await page.getByRole("button", { name: "Enter sandbox", exact: true }).click();
}

/** Leave whatever sandbox this session holds, so a failed run doesn't leak one into the next. */
async function exitQuietly(page: Page) {
  await page
    .evaluate(() =>
      fetch("/api/test-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exit" }),
      }),
    )
    .catch(() => undefined);
}

test.describe("test sandbox", () => {
  test("enter shows the banner, and Exit returns you as yourself", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAsQaSuperAdmin(page);
    try {
      await enterSandbox(page);
      await expect(banner(page)).toBeVisible({ timeout: 90_000 });

      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("button", { name: "View as a User" }).click();
      await expect(page.getByText("Viewing as regular user")).toBeVisible();
      await expect(banner(page)).toBeVisible();

      await banner(page).getByRole("button", { name: "Exit sandbox", exact: true }).click();
      await expect(banner(page)).toBeHidden({ timeout: 60_000 });
      await expect(page.getByText("Viewing as regular user")).toBeHidden();
    } finally {
      await exitQuietly(page);
    }
  });

  test("a second session asks before replacing the sandbox, and the first says it ended", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    try {
      await loginAsQaSuperAdmin(page);
      await enterSandbox(page);
      await expect(banner(page)).toBeVisible({ timeout: 90_000 });

      // Signing in elsewhere keeps a live session's sandbox (migration 136).
      await loginAsQaSuperAdmin(other);
      await enterSandbox(other);
      await expect(other.getByText("Replace your other sandbox?")).toBeVisible({
        timeout: 30_000,
      });
      await other.getByRole("button", { name: "Start here instead" }).click();
      await expect(banner(other)).toBeVisible({ timeout: 90_000 });

      await page.reload();
      await expect(page.getByText(/Your test sandbox has ended/)).toBeVisible({ timeout: 30_000 });
      await expect(banner(page)).toBeHidden();
    } finally {
      await exitQuietly(other);
      await exitQuietly(page);
      await otherContext.close();
    }
  });
});

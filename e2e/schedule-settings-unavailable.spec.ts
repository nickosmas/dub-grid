import { expect, test, type Page } from "@playwright/test";
import { clearBlockingOverlays, loginAsQaSuperAdmin } from "./helpers/auth";

// 2026-11-15, production: after a laptop slept, the organization's settings
// were dropped and their refetch paused offline, and the Schedule painted with
// no sections ("Nobody assigned here yet") and shifts as "?". The page must
// wait for the settings instead, and recover once they load.

/** Drops the settings from the page's query cache, as the wake-up did. */
async function dropOrganizationSettings(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const cell = document.querySelector(".dg-grid-cell");
    const fiberKey = cell && Object.keys(cell).find((key) => key.startsWith("__reactFiber"));
    type Fiber = { memoizedProps?: { client?: unknown }; return?: Fiber };
    let fiber = fiberKey ? ((cell as unknown as Record<string, Fiber>)[fiberKey] ?? null) : null;
    while (fiber) {
      const client = fiber.memoizedProps?.client as
        { resetQueries?: (filters: { queryKey: unknown[] }) => Promise<void> } | undefined;
      if (client?.resetQueries) {
        void client.resetQueries({ queryKey: ["org", "bootstrap"] });
        return;
      }
      fiber = fiber.return ?? null;
    }
    throw new Error("No query client above the schedule grid");
  });
}

test("the Schedule waits for its settings rather than painting without them", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  expect(new URL(origin).hostname.startsWith("calmhaven.")).toBe(true);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await loginAsQaSuperAdmin(page, origin);
  await page.goto(`${origin}/schedule`, { waitUntil: "commit" });
  await clearBlockingOverlays(page);
  await expect(page.locator(".dg-grid-cell").first()).toBeVisible({ timeout: 60_000 });

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await dropOrganizationSettings(page);

  await expect(page.getByText("Getting things ready")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Nobody assigned here yet")).toHaveCount(0);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".dg-grid-cell").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Nobody assigned here yet")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

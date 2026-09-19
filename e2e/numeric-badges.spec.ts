import { expect, test, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

/**
 * Every numeric count badge is one pill contract (feature 23a): the height is
 * the size token, the width never drops below the height, the corners are
 * fully round, and a wider value only ever widens the pill. jsdom computes no
 * layout, so the proof needs a real browser and the real stylesheet.
 *
 * The seed rarely shows more than one or two counts, so the badges that are on
 * screen are driven through the representative values by hand. The badge is a
 * pure span whose text is its only content, so swapping the text is the same
 * render path as a real count.
 */

const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const organizationOrigin = `http://ardenwood.${baseDomain}:${port}`;

const routes = ["/alerts", "/schedule", "/people"] as const;
const themes = ["light", "dark"] as const;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop at 200% effective zoom", width: 720, height: 450 },
] as const;
const representativeValues = ["1", "2", "9", "10", "26", "50", "99", "99+"] as const;
const expectedHeightBySize = { sm: 16, md: 20 } as const;

// Fewer badges than this across every route means a page rendered without its
// counts (or the attribute was dropped), and the spec would pass by measuring
// nothing.
const MINIMUM_BADGES_MEASURED = 3;

interface BadgeFailure {
  route: string;
  theme: string;
  viewport: string;
  value: string;
  size: string;
  tone: string;
  reason: string;
}

async function measureBadges(
  page: Page,
  context: { route: string; theme: string; viewport: string },
): Promise<{ measured: number; failures: BadgeFailure[] }> {
  return page.evaluate(
    ({ context, values, expectedHeightBySize }) => {
      const badges = Array.from(
        document.querySelectorAll<HTMLElement>("[data-numeric-badge]"),
      ).filter((badge) => badge.getClientRects().length > 0);
      const failures: BadgeFailure[] = [];

      for (const badge of badges) {
        const size = badge.dataset.size ?? "";
        const tone = badge.dataset.tone ?? "";
        const original = badge.textContent;
        let previousWidth = 0;

        for (const value of values) {
          badge.textContent = value;
          const rect = badge.getBoundingClientRect();
          const radius = Number.parseFloat(getComputedStyle(badge).borderRadius);
          const expectedHeight = expectedHeightBySize[size as keyof typeof expectedHeightBySize];
          const fail = (reason: string) => failures.push({ ...context, value, size, tone, reason });

          if (expectedHeight === undefined) fail(`unknown size "${size}"`);
          else if (Math.abs(rect.height - expectedHeight) > 0.5)
            fail(`height ${rect.height.toFixed(1)} is not ${expectedHeight}`);
          if (rect.width + 0.5 < rect.height)
            fail(
              `width ${rect.width.toFixed(1)} is narrower than height ${rect.height.toFixed(1)}`,
            );
          if (!(radius >= rect.height / 2))
            fail(`radius ${radius} does not round a ${rect.height.toFixed(1)}px pill`);
          if (rect.width + 0.5 < previousWidth)
            fail(`width ${rect.width.toFixed(1)} shrank from ${previousWidth.toFixed(1)}`);
          previousWidth = rect.width;
        }

        badge.textContent = original;
      }

      return { measured: badges.length, failures };
    },
    { context, values: representativeValues, expectedHeightBySize },
  );
}

test("numeric badges keep one pill contract across values, themes, and zoom", async ({ page }) => {
  test.slow();
  await loginAsQaSuperAdmin(page);

  const failures: BadgeFailure[] = [];
  let measured = 0;

  for (const route of routes) {
    // Desktop first: the previous route leaves the narrow viewport behind,
    // where the header folds into a menu and the shell check below has no
    // link to find.
    await page.setViewportSize({ width: viewports[0].width, height: viewports[0].height });
    await page.goto(`${organizationOrigin}${route}`);
    // The app shell, not just the document: a route still compiling on the
    // dev server has a visible body and no badges, and would only trip the
    // minimum-count guard below.
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-schedule-loading]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("[data-numeric-badge]").first()).toBeVisible({ timeout: 15_000 });

    for (const theme of themes) {
      await page.evaluate((activeTheme) => {
        document.documentElement.classList.toggle("dark", activeTheme === "dark");
        document.documentElement.style.colorScheme = activeTheme;
      }, theme);

      for (const viewport of viewports) {
        await test.step(`${route} ${theme} ${viewport.name}`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.waitForTimeout(150);
          const result = await measureBadges(page, { route, theme, viewport: viewport.name });
          measured += result.measured;
          failures.push(...result.failures);
        });
      }
    }
  }

  expect(measured, "badges measured across all routes").toBeGreaterThanOrEqual(
    MINIMUM_BADGES_MEASURED,
  );
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

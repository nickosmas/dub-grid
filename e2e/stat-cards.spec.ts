import { expect, test, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

/**
 * Stat cards must read as one set of tiles, so every card sharing a row has to
 * share its height. Grid and flex already stretch their direct children, so the
 * failure mode this guards is narrow and recurring: an interactive wrapper
 * (a Link, a Button) sits between the track and the card, absorbs the stretch,
 * and leaves the card box at content height. jsdom computes no layout, so this
 * can only be proven in a real browser.
 *
 * Cards opt in with `data-stat-card` on their outermost box.
 */

const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const organizationOrigin = `http://ardenwood.${baseDomain}:${port}`;

// A card that only diverges once a long label wraps stays equal at desktop
// width, so the narrow viewport is load-bearing rather than redundant.
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

// The reports metric strip is deliberately absent: it only renders once a
// report has been run and returned rows, so it has no cards to measure on load.
const routes = [
  { path: "/dashboard", label: "dashboard hero", minimumCards: 2 },
  { path: "/people", label: "directory summary and certification tiles", minimumCards: 2 },
] as const;

interface UnequalRow {
  route: string;
  viewport: string;
  labels: string[];
  heights: number[];
}

async function auditStatCardRows(
  page: Page,
  route: string,
  viewport: string,
): Promise<UnequalRow[]> {
  return page.evaluate(
    ({ route, viewport }) => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-stat-card]"));

      // Group by the track that lays the cards out. The card's own grid/flex
      // parent is whichever ancestor is the direct child of that track, so walk
      // up to the first ancestor whose computed display establishes one.
      const rows = new Map<Element, HTMLElement[]>();
      for (const card of cards) {
        if (card.offsetParent === null && card.getClientRects().length === 0) {
          continue; // hidden behind a closed tab or an unopened panel
        }
        let node: HTMLElement | null = card;
        let track: Element | null = null;
        while (node?.parentElement) {
          const display = getComputedStyle(node.parentElement).display;
          if (/(^|\s)(grid|flex|inline-grid|inline-flex)$/.test(display)) {
            track = node.parentElement;
            break;
          }
          node = node.parentElement;
        }
        if (!track) {
          continue;
        }
        const group = rows.get(track);
        if (group) {
          group.push(card);
        } else {
          rows.set(track, [card]);
        }
      }

      const failures: UnequalRow[] = [];
      for (const group of rows.values()) {
        if (group.length < 2) {
          continue;
        }
        const measured = group.map((card) => ({
          label: (card.textContent ?? "").trim().slice(0, 40) || "(unlabelled)",
          top: Math.round(card.getBoundingClientRect().top),
          height: card.getBoundingClientRect().height,
        }));
        // Only compare cards actually sitting on the same visual row; an
        // auto-fit track wraps on narrow viewports and a wrapped card is not
        // expected to match the row above it.
        const byTop = new Map<number, typeof measured>();
        for (const entry of measured) {
          const bucket = byTop.get(entry.top);
          if (bucket) {
            bucket.push(entry);
          } else {
            byTop.set(entry.top, [entry]);
          }
        }
        for (const bucket of byTop.values()) {
          if (bucket.length < 2) {
            continue;
          }
          const tallest = Math.max(...bucket.map((entry) => entry.height));
          if (bucket.some((entry) => Math.abs(entry.height - tallest) > 1)) {
            failures.push({
              route,
              viewport,
              labels: bucket.map((entry) => entry.label),
              heights: bucket.map((entry) => Math.round(entry.height * 10) / 10),
            });
          }
        }
      }
      return failures;
    },
    { route, viewport },
  );
}

test("stat cards sharing a row are equal height", async ({ page }) => {
  test.slow();
  await loginAsQaSuperAdmin(page);

  const failures: UnequalRow[] = [];

  for (const route of routes) {
    await page.goto(`${organizationOrigin}${route.path}`);
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    for (const viewport of viewports) {
      await test.step(`${route.path} (${route.label}) at ${viewport.name}`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.locator("[data-schedule-loading]")).toHaveCount(0, { timeout: 15_000 });

        // These tiles arrive with their data, well after load. Without gating on
        // them the audit would measure an empty set and this whole guard would
        // pass vacuously, which is exactly how it failed to catch a real
        // regression the first time it was written.
        await expect
          .poll(async () => page.locator("[data-stat-card]").count(), { timeout: 20_000 })
          .toBeGreaterThanOrEqual(route.minimumCards);

        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );
        await page.waitForTimeout(250);

        failures.push(...(await auditStatCardRows(page, route.path, viewport.name)));
      });
    }
  }

  expect(
    failures,
    failures.length
      ? `Stat cards in the same row rendered at different heights:\n${failures
          .map(
            (row) =>
              `  ${row.route} @ ${row.viewport}: ${row.labels
                .map((label, index) => `"${label}" ${row.heights[index]}px`)
                .join(", ")}`,
          )
          .join("\n")}`
      : undefined,
  ).toEqual([]);
});

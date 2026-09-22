import { expect, test, type Locator, type Page } from "@playwright/test";
import { clearBlockingOverlays, loginAsQaSuperAdmin, QA_CALM_HAVEN_ORIGIN } from "./helpers/auth";

/**
 * Hover and keyboard focus against the real stylesheet.
 *
 * Selected state and hover state are written as two rules of equal specificity
 * on the same property, so only source order decides which one paints a
 * selected element under the pointer. Splitting globals.css into globals.css
 * and app-ui.css put some of those pairs in different files and silently
 * inverted them: hovering the selected tab, segment or expanded row painted it
 * as merely hovered. Nothing caught it, because every other check looks at
 * pages at rest.
 *
 * The contract each case asserts: hovering a selected element leaves its
 * selected treatment alone, while the same hover on an unselected sibling does
 * change it (otherwise the case would pass by measuring a hover that does
 * nothing).
 */

interface SelectedCase {
  name: string;
  route: string;
  /** Any element of the group, selected or not. */
  group: string;
  /** The selected one within that group. */
  selected: string;
  /** The property the selected and hover rules contend over. */
  property: "background-color" | "color" | "border-bottom-color";
}

const CASES: SelectedCase[] = [
  {
    name: "nav tab (settings)",
    route: "/settings",
    group: ".dg-nav-tab",
    selected: ".dg-nav-tab.active",
    property: "background-color",
  },
  {
    name: "span tab (schedule)",
    route: "/schedule",
    group: ".dg-span-tab",
    selected: ".dg-span-tab.active",
    // The selected span tab wins on background; hover only ever moves the
    // text, so colour is the property the two rules actually contend over.
    property: "color",
  },
  {
    name: "span tab (alerts, light variant)",
    route: "/alerts",
    group: ".dg-span-tab",
    selected: ".dg-span-tab.active",
    property: "color",
  },
];

/** Routes that must contribute at least one measured case between them. */
const ROUTES = [...new Set(CASES.map((testCase) => testCase.route))];

const MINIMUM_CASES_MEASURED = 3;

async function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (element, prop) => getComputedStyle(element).getPropertyValue(prop),
    property,
  );
}

/** Moves the pointer off every interactive element. */
async function unhover(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
}

test.describe("interactive states", () => {
  // Signing in, then three routes hovered twice each with a settle between:
  // well past the default budget on a cold development server.
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    // The helper signs in on its own default organization; this spec reads the
    // app chrome, so it stays on the one the config points at.
    await loginAsQaSuperAdmin(page, QA_CALM_HAVEN_ORIGIN);
    await clearBlockingOverlays(page);
  });

  test("hovering a selected control keeps its selected treatment", async ({ page }) => {
    const measured: string[] = [];
    const failures: string[] = [];

    for (const route of ROUTES) {
      await page.goto(`${QA_CALM_HAVEN_ORIGIN}${route}`);
      await page.waitForLoadState("networkidle").catch(() => undefined);

      for (const testCase of CASES.filter((candidate) => candidate.route === route)) {
        const selected = page.locator(testCase.selected).first();
        if ((await selected.count()) === 0) continue;
        await selected.scrollIntoViewIfNeeded();

        await unhover(page);
        const selectedAtRest = await styleOf(selected, testCase.property);

        await selected.hover();
        await page.waitForTimeout(350); // the rules transition over 150-200ms
        const selectedHovered = await styleOf(selected, testCase.property);

        if (selectedHovered !== selectedAtRest) {
          failures.push(
            `${testCase.name}: hovering the selected control changed ${testCase.property} ` +
              `from ${selectedAtRest} to ${selectedHovered}`,
          );
        }

        // The same hover has to do something to an unselected sibling, or the
        // assertion above proves nothing.
        const unselected = page.locator(`${testCase.group}:not(.active)`).first();
        if ((await unselected.count()) > 0) {
          await unhover(page);
          const siblingAtRest = await styleOf(unselected, testCase.property);
          await unselected.hover();
          await page.waitForTimeout(350);
          const siblingHovered = await styleOf(unselected, testCase.property);

          if (siblingHovered === siblingAtRest) {
            failures.push(
              `${testCase.name}: hover does not change ${testCase.property} on an ` +
                `unselected control (${siblingAtRest}), so the selected case is vacuous`,
            );
          } else if (selectedHovered === siblingHovered) {
            failures.push(
              `${testCase.name}: the selected control under the pointer renders exactly ` +
                `like a hovered unselected one (${siblingHovered})`,
            );
          }
        }

        measured.push(testCase.name);
        await unhover(page);
      }
    }

    expect(failures).toEqual([]);
    expect(measured.length).toBeGreaterThanOrEqual(MINIMUM_CASES_MEASURED);
  });

  test("keyboard focus draws the focus ring on app chrome", async ({ page }) => {
    await page.goto(`${QA_CALM_HAVEN_ORIGIN}/settings`);
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const tab = page.locator(".dg-nav-tab").first();
    await expect(tab).toBeVisible();
    const outlineAtRest = await styleOf(tab, "outline-width");

    // :focus-visible answers the keyboard, not a script, so focus has to arrive
    // through one. Walk the tab ring until a nav tab holds it.
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    let focusedTab = null;
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      const candidate = page.locator(".dg-nav-tab:focus-visible");
      if ((await candidate.count()) > 0) {
        focusedTab = candidate.first();
        break;
      }
    }

    expect(focusedTab, "no nav tab took keyboard focus within 40 tab stops").not.toBeNull();
    const outlineFocused = await styleOf(focusedTab!, "outline-width");
    expect(outlineFocused).not.toBe(outlineAtRest);
    expect(outlineFocused).not.toBe("0px");
  });
});

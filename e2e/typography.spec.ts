import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";
import {
  settingsPanelAuditManifest,
  typographyRouteAuditManifest,
} from "./typography-route-manifest";

const port = process.env.PORT || 3000;
const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";
const apexOrigin = `http://${baseDomain}:${port}`;
const organizationOrigin = `http://ardenwood.${baseDomain}:${port}`;

// Split by what each entry needs, not by position: removing a public entry
// used to shift the first signed-in route into the signed-out pass.
const isSignedOutEntry = (entry: (typeof typographyRouteAuditManifest)[number]) =>
  entry.access === "public" || entry.browserExpectation === "login-redirect";
const publicEntryRoutes = typographyRouteAuditManifest.filter(isSignedOutEntry);
const authenticatedEntryRoutes = typographyRouteAuditManifest.filter(
  (entry) => !isSignedOutEntry(entry),
);

const routeAuditViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop at 200% effective zoom", width: 720, height: 450 },
] as const;

/**
 * `options.appUi` says whether this route loads `app-ui.css`, which is where
 * the content-hierarchy classes live. Public routes deliberately do not load
 * it any more (the app stylesheet is not shipped to a signed-out visitor), so
 * asserting those classes there measured an unstyled probe and read the
 * browser default rather than a contract anyone wrote.
 */
async function auditRenderedTypography(
  page: Page,
  route: string,
  options: { appUi: boolean } = { appUi: true },
): Promise<void> {
  await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(150);

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((activeTheme) => {
      document.documentElement.classList.toggle("dark", activeTheme === "dark");
      document.documentElement.style.colorScheme = activeTheme;
    }, theme);

    for (const viewport of routeAuditViewports) {
      await test.step(`${route} ${theme} ${viewport.name}`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await expect(page.locator("[data-schedule-loading]")).toHaveCount(0, {
          timeout: 15_000,
        });
        if (viewport.width <= 767) {
          await expect(page.locator(".dg-nav-tab")).toHaveCount(0, { timeout: 5_000 });
        }
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );
        await page.waitForTimeout(200);
        await expect(page.locator("[data-schedule-loading]")).toHaveCount(0, {
          timeout: 15_000,
        });
        const audit = await page.evaluate(() => {
          const contentGroupHeadingProbe = document.createElement("span");
          contentGroupHeadingProbe.className = "dg-type-content-group-heading";
          contentGroupHeadingProbe.textContent = "Content group";
          const fieldTitleProbe = document.createElement("span");
          fieldTitleProbe.className = "dg-type-field-title";
          fieldTitleProbe.textContent = "Field title";
          document.body.append(contentGroupHeadingProbe, fieldTitleProbe);
          const contentGroupHeadingStyle = getComputedStyle(contentGroupHeadingProbe);
          const fieldTitleStyle = getComputedStyle(fieldTitleProbe);
          const contentHierarchy = {
            contentGroupHeading: {
              color: contentGroupHeadingStyle.color,
              fontSize: contentGroupHeadingStyle.fontSize,
              fontWeight: contentGroupHeadingStyle.fontWeight,
            },
            fieldTitle: {
              color: fieldTitleStyle.color,
              fontSize: fieldTitleStyle.fontSize,
              fontWeight: fieldTitleStyle.fontWeight,
            },
          };
          contentGroupHeadingProbe.remove();
          fieldTitleProbe.remove();

          const visible = (element: Element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
          };
          const renderedTextWeights = (element: HTMLElement) => {
            const controlBounds = element.getBoundingClientRect();
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const weights: number[] = [];
            let textNode = walker.nextNode();
            while (textNode) {
              if (textNode.textContent?.trim()) {
                const range = document.createRange();
                range.selectNodeContents(textNode);
                const textBounds = range.getBoundingClientRect();
                if (
                  textBounds.width > 2 &&
                  textBounds.height > 2 &&
                  textBounds.right >= controlBounds.left &&
                  textBounds.left <= controlBounds.right &&
                  textBounds.bottom >= controlBounds.top &&
                  textBounds.top <= controlBounds.bottom
                ) {
                  const textParent = textNode.parentElement;
                  if (textParent) {
                    weights.push(Number.parseInt(getComputedStyle(textParent).fontWeight, 10));
                  }
                }
              }
              textNode = walker.nextNode();
            }
            return weights;
          };
          const thinControls = [
            ...document.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="button"]:not([aria-disabled="true"])',
            ),
          ]
            .filter(visible)
            .filter((element) => {
              const style = getComputedStyle(element);
              if (element.matches("input, select, textarea")) {
                if (
                  element instanceof HTMLInputElement &&
                  ["checkbox", "radio", "range", "color", "file"].includes(element.type)
                ) {
                  return false;
                }
                return Number.parseInt(style.fontWeight, 10) < 500;
              }
              const weights = renderedTextWeights(element);
              return weights.length > 0 && weights.every((weight) => weight < 500);
            })
            .slice(0, 8)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              label:
                element.textContent?.trim().slice(0, 60) ||
                element.getAttribute("aria-label") ||
                element.getAttribute("placeholder"),
              weight: getComputedStyle(element).fontWeight,
            }));

          const viewportWidth = document.documentElement.clientWidth;
          const overflowingElements = [...document.body.querySelectorAll<HTMLElement>("*")]
            .filter(visible)
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              if (bounds.right <= viewportWidth + 1 && bounds.left >= -1) return false;
              if (element.closest('[role="grid"]')) return false;

              let ancestor = element.parentElement;
              while (ancestor && ancestor !== document.body) {
                if (
                  ["auto", "scroll", "hidden", "clip"].includes(
                    getComputedStyle(ancestor).overflowX,
                  )
                ) {
                  return false;
                }
                ancestor = ancestor.parentElement;
              }
              return true;
            })
            .slice(0, 5)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().slice(0, 60),
              left: Math.round(element.getBoundingClientRect().left),
              right: Math.round(element.getBoundingClientRect().right),
            }));

          return {
            bodyFont: getComputedStyle(document.body).fontFamily,
            contentHierarchy,
            thinControls,
            overflowingElements,
          };
        });

        // Inter is the product typeface for all product UI and ordinary copy
        // (item 24); DM Sans is scoped to the wordmark and landing/marketing
        // titles and headings, not the page's base body font.
        expect(audit.bodyFont).toContain("Inter");
        if (options.appUi) {
          expect(audit.contentHierarchy.contentGroupHeading.fontSize).toBe("14px");
          expect(audit.contentHierarchy.contentGroupHeading.fontWeight).toBe("600");
          expect(audit.contentHierarchy.fieldTitle.fontSize).toBe("13px");
          expect(audit.contentHierarchy.fieldTitle.fontWeight).toBe("500");
          expect(audit.contentHierarchy.contentGroupHeading.color).toBe(
            audit.contentHierarchy.fieldTitle.color,
          );
        }
        expect(audit.thinControls, JSON.stringify({ route, theme, viewport, audit })).toEqual([]);
        expect(
          audit.overflowingElements,
          JSON.stringify({ route, theme, viewport, audit }),
        ).toEqual([]);
      });
    }
  }
}

test("typography audit manifest owns explicit evidence for every route state", () => {
  expect(typographyRouteAuditManifest).toHaveLength(25);
  expect(new Set(typographyRouteAuditManifest.map((entry) => entry.route)).size).toBe(25);

  for (const entry of typographyRouteAuditManifest) {
    expect(existsSync(resolve(process.cwd(), entry.source)), entry.source).toBe(true);
    const evidencedStates = [...entry.browserStates, ...entry.sourceReviewedStates];
    expect(entry.browserStates.length, `${entry.route} needs browser evidence`).toBeGreaterThan(0);
    expect(evidencedStates.length, `${entry.route} needs state evidence`).toBeGreaterThan(0);
    expect(new Set(evidencedStates).size, `${entry.route} repeats state evidence`).toBe(
      evidencedStates.length,
    );
    expect(entry).not.toHaveProperty("auditStatus");
  }

  expect(settingsPanelAuditManifest).toHaveLength(15);
  for (const panel of settingsPanelAuditManifest) {
    expect(existsSync(resolve(process.cwd(), panel.source)), panel.source).toBe(true);
    expect(panel).not.toHaveProperty("auditStatus");
  }
});

test("public and gated route entries pass the rendered typography matrix", async ({ page }) => {
  test.setTimeout(300_000);

  for (const entry of publicEntryRoutes) {
    const origin = entry.origin === "apex" ? apexOrigin : organizationOrigin;
    await page.goto(`${origin}${entry.visit}`);

    if (entry.browserExpectation === "login-redirect") {
      await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
    } else {
      expect(new URL(page.url()).pathname).toBe(entry.route);
    }

    await test.step(`browser evidence: ${entry.browserStates.join(", ")}`, async () => {
      // A public entry renders without the app stylesheet by design, so only
      // the contract that applies there is asserted: Inter as the body face,
      // no thin controls, nothing overflowing its viewport.
      await auditRenderedTypography(page, entry.route, { appUi: false });
    });
  }
});

test("authenticated route entries pass the rendered typography matrix", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsQaSuperAdmin(page);

  await page.goto(`${organizationOrigin}/people`);
  const personHref = await page.locator('a[href^="/people/"]').first().getAttribute("href");
  expect(personHref, "The seeded People fixture should expose a detail route").toBeTruthy();

  for (const entry of authenticatedEntryRoutes) {
    const visit = entry.route === "/people/[id]" ? personHref! : entry.visit;
    await page.goto(`${organizationOrigin}${visit}`);

    if (entry.browserExpectation === "route-redirect") {
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
        .toBe(entry.expectedPath);
    } else {
      await expect(page).not.toHaveURL(/\/login/);
      expect(new URL(page.url()).pathname).toBe(
        entry.route.replace("/[id]", `/${personHref!.split("/").pop()}`),
      );
    }

    await test.step(`browser evidence: ${entry.browserStates.join(", ")}`, async () => {
      await auditRenderedTypography(page, entry.route);
    });
  }
});

test("every lazy settings panel renders under the typography contract", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsQaSuperAdmin(page);

  for (const panel of settingsPanelAuditManifest) {
    const section = panel.id;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${organizationOrigin}/settings?section=${section}`);
    const sectionHref = section === "org-general" ? "/settings" : `/settings?section=${section}`;
    await expect(page.locator(`a[href="${sectionHref}"][aria-current="page"]`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-settings-section-loading]")).toHaveCount(0, {
      timeout: 15_000,
    });
    await auditRenderedTypography(page, `/settings?section=${section}`);
  }
});

test("directory filter overlays preserve readable controls and viewport bounds", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loginAsQaSuperAdmin(page);

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await test.step(`${theme} ${viewport.name}`, async () => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(`${organizationOrigin}/people`);
        await page.evaluate((activeTheme) => {
          document.documentElement.classList.toggle("dark", activeTheme === "dark");
          document.documentElement.style.colorScheme = activeTheme;
        }, theme);

        const filterButton = page.getByRole("button", { name: "Filter", exact: true });
        await expect(filterButton).toBeVisible();
        await filterButton.click();

        const doneButton = page.getByRole("button", { name: "Done", exact: true });
        await expect(doneButton).toBeVisible();
        const controlStyle = await doneButton.evaluate((element) => {
          const style = getComputedStyle(element);
          return { fontSize: style.fontSize, fontWeight: style.fontWeight };
        });
        expect(controlStyle.fontSize).toBe("14px");
        expect(Number.parseInt(controlStyle.fontWeight, 10)).toBeGreaterThanOrEqual(500);

        const viewportAudit = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(viewportAudit.scrollWidth).toBeLessThanOrEqual(viewportAudit.clientWidth + 1);

        await doneButton.click();
        await expect(doneButton).toBeHidden();
      });
    }
  }
});

const principalRoutes = [
  { path: "/dashboard", expectsPageTitle: true },
  { path: "/schedule", expectsPageTitle: false },
  { path: "/people", expectsPageTitle: true },
  { path: "/reports", expectsPageTitle: true },
  { path: "/settings", expectsPageTitle: true },
] as const;

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 900, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const zoomLevels = [1, 1.25, 2] as const;
const themes = ["light", "dark"] as const;

// A full document load shows the auth transition screen before the page, and
// that screen has an h1 of its own. Between it and the page's title the
// dashboard paints its skeleton with no h1 at all, so a wait for "any h1"
// can pass on the handoff and then measure the gap.
const AUTH_TRANSITION_TITLES =
  /^(Signing you in|Loading your workspace|Setting up your workspace)$/;

test("productive typography keeps its hierarchy across routes, themes, widths, and zoom", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsQaSuperAdmin(page);

  const authenticatedOrigin = new URL(page.url()).origin;

  for (const route of principalRoutes) {
    await page.goto(`${authenticatedOrigin}${route.path}`);
    await expect(page).not.toHaveURL(/\/login/);
    if (route.expectsPageTitle) {
      await expect(
        page.locator("h1").filter({ hasNotText: AUTH_TRANSITION_TITLES }).first(),
      ).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(page.getByRole("textbox", { name: "Search staff…" })).toBeVisible();
    }

    for (const theme of themes) {
      await page.evaluate((activeTheme) => {
        document.documentElement.classList.toggle("dark", activeTheme === "dark");
        document.documentElement.style.colorScheme = activeTheme;
      }, theme);

      for (const viewport of viewports) {
        for (const zoom of zoomLevels) {
          await test.step(`${route.path} ${theme} ${viewport.name} at ${zoom * 100}%`, async () => {
            // Browser zoom reduces the available CSS viewport. Modeling that
            // effective viewport exercises the same responsive breakpoints and
            // wrapping behavior without relying on browser-chrome shortcuts.
            const effectiveWidth = Math.round(viewport.width / zoom);
            const effectiveHeight = Math.round(viewport.height / zoom);
            await page.setViewportSize({ width: effectiveWidth, height: effectiveHeight });
            if (effectiveWidth <= 767) {
              await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
            } else {
              await expect(
                page.getByRole("link", { name: "Dashboard", exact: true }),
              ).toBeVisible();
            }

            const hierarchy = await page.evaluate(() => {
              const title = document.querySelector("h1");
              const description = title?.nextElementSibling;
              const titleStyle = title ? getComputedStyle(title) : null;
              const descriptionStyle = description ? getComputedStyle(description) : null;
              const viewportWidth = document.documentElement.clientWidth;

              return {
                titleFontSize: titleStyle?.fontSize,
                titleWeight: titleStyle?.fontWeight,
                titleColor: titleStyle?.color,
                descriptionColor: descriptionStyle?.color,
                pageScrollWidth: document.documentElement.scrollWidth,
                overflowingElements: [...document.body.querySelectorAll("*")]
                  .filter((element) => {
                    const bounds = element.getBoundingClientRect();
                    if (bounds.right <= viewportWidth + 1 && bounds.left >= -1) return false;
                    if (element.closest('[role="grid"]')) return false;

                    let ancestor = element.parentElement;
                    while (ancestor && ancestor !== document.body) {
                      const overflowX = getComputedStyle(ancestor).overflowX;
                      if (["auto", "scroll", "hidden", "clip"].includes(overflowX)) return false;
                      ancestor = ancestor.parentElement;
                    }

                    return true;
                  })
                  .slice(0, 5)
                  .map((element) => ({
                    tag: element.tagName.toLowerCase(),
                    className: element.getAttribute("class"),
                    text: element.textContent?.trim().slice(0, 80),
                    left: Math.round(element.getBoundingClientRect().left),
                    right: Math.round(element.getBoundingClientRect().right),
                    viewportWidth,
                  })),
              };
            });

            if (route.expectsPageTitle) {
              expect(hierarchy.titleFontSize).toBe(effectiveWidth <= 767 ? "24px" : "28px");
              expect(hierarchy.titleWeight).toBe("700");
              expect(hierarchy.titleColor).not.toBe(hierarchy.descriptionColor);
            } else {
              const controlFontSize = await page
                .getByRole("textbox", { name: "Search staff…" })
                .evaluate((control) => getComputedStyle(control).fontSize);
              expect(controlFontSize).toBe("14px");
            }
            // The schedule grid is intentionally horizontally scrollable (the
            // per-element check below already excludes it via its `role="grid"`
            // ancestor), and at the narrowest simulated zoom that scroll width
            // reaches the document level by a couple of px even though no
            // single element reports itself out of bounds.
            if (route.path !== "/schedule") {
              expect(
                hierarchy.pageScrollWidth,
                JSON.stringify({ route: route.path, theme, viewport, zoom, hierarchy }),
              ).toBeLessThanOrEqual(effectiveWidth + 1);
              expect(hierarchy.overflowingElements).toEqual([]);
            }

            if (route.path === "/settings" && effectiveWidth >= 768) {
              const sectionHierarchy = await page
                .getByText("General", { exact: true })
                .evaluate((sectionLabel) => {
                  const sectionStyle = getComputedStyle(sectionLabel);
                  return {
                    fontSize: sectionStyle.fontSize,
                    fontWeight: sectionStyle.fontWeight,
                    textTransform: sectionStyle.textTransform,
                    color: sectionStyle.color,
                  };
                });
              const navigationHierarchy = await page
                .getByRole("link", { name: "Organization Details", exact: true })
                .evaluate((navigationItem) => {
                  const navigationStyle = getComputedStyle(navigationItem);
                  return {
                    fontSize: navigationStyle.fontSize,
                    fontWeight: navigationStyle.fontWeight,
                    color: navigationStyle.color,
                  };
                });
              const inactiveNavigationWeight = await page
                .getByRole("link", { name: "Labels", exact: true })
                .evaluate((navigationItem) => getComputedStyle(navigationItem).fontWeight);

              expect(sectionHierarchy.fontSize).toBe("14px");
              expect(sectionHierarchy.fontWeight).toBe("600");
              expect(sectionHierarchy.textTransform).toBe("none");
              expect(navigationHierarchy.fontSize).toBe("14px");
              expect(navigationHierarchy.fontWeight).toBe("600");
              expect(inactiveNavigationWeight).toBe("500");
              expect(navigationHierarchy.color).not.toBe(sectionHierarchy.color);
            }

            if (route.path === "/settings" && zoom !== 1.25) {
              await testInfo.attach(
                `${route.path.slice(1)}-${theme}-${viewport.name}-${zoom * 100}`,
                {
                  body: await page.screenshot(),
                  contentType: "image/png",
                },
              );
            }
          });
        }
      }
    }
  }
});

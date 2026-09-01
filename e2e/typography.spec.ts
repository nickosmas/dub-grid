import { expect, test } from "@playwright/test";
import { loginAsQaSuperAdmin } from "./helpers/auth";

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
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
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
            expect(
              hierarchy.pageScrollWidth,
              JSON.stringify({ route: route.path, theme, viewport, zoom, hierarchy }),
            ).toBeLessThanOrEqual(effectiveWidth + 1);
            if (route.path !== "/schedule") {
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

              expect(sectionHierarchy.fontSize).toBe("14px");
              expect(sectionHierarchy.fontWeight).toBe("600");
              expect(sectionHierarchy.textTransform).toBe("none");
              expect(navigationHierarchy.fontSize).toBe("14px");
              expect(navigationHierarchy.fontWeight).toBe("500");
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

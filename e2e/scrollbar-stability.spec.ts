import { expect, test, type Page } from "@playwright/test";

// Headless Chromium hides scrollbars by default; showing them gives the
// space-taking scrollbar a mouse user sees on an external monitor.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

async function layout(page: Page) {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    left: Math.round(document.querySelector("form")!.getBoundingClientRect().left),
  }));
}

test("a scrollbar appearing or a scroll lock never moves the page sideways", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible();

  const scrollbarWidth = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:0;width:100px;height:100px;overflow:scroll";
    document.body.append(probe);
    const width = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return width;
  });
  test.skip(scrollbarWidth === 0, "this browser draws overlay scrollbars, which take no width");

  const short = await layout(page);

  await page.evaluate(() => {
    const filler = document.createElement("div");
    filler.id = "filler";
    filler.style.height = "3000px";
    document.body.append(filler);
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await layout(page)).toEqual(short);

  // How our slideovers and the mobile nav sheet lock the page.
  await page.evaluate(() => {
    document.body.style.overflow = "hidden";
  });
  expect(await layout(page)).toEqual(short);

  // Without the reserved gutter a short page here is wider than a long one,
  // so the checks above measured something real.
  await page.evaluate(() => {
    document.body.style.overflow = "";
    document.getElementById("filler")!.remove();
    document.documentElement.style.scrollbarGutter = "auto";
  });
  expect((await layout(page)).width).toBe(short.width + scrollbarWidth);
});

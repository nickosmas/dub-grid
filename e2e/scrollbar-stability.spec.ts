import { expect, test, type Page } from "@playwright/test";

// Headless Chromium hides scrollbars by default; showing them gives the
// space-taking scrollbar a mouse user sees on an external monitor.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

// The width and position of the page's content box, read from a full-width
// block at the top of <body>.
async function layout(page: Page) {
  return page.evaluate(() => {
    const box = document.getElementById("layout-probe")!.getBoundingClientRect();
    return { left: Math.round(box.left), width: Math.round(box.width) };
  });
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

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "layout-probe";
    document.body.prepend(probe);
  });
  const short = await layout(page);

  await page.evaluate(() => {
    const filler = document.createElement("div");
    filler.id = "filler";
    filler.style.height = "3000px";
    document.body.append(filler);
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await layout(page)).toEqual(short);

  // What lockPageScroll() does while a panel or sheet is open.
  await page.evaluate(() => {
    const body = document.body;
    const before = body.getBoundingClientRect().width;
    document.documentElement.style.overflow = "hidden";
    const widened = Math.round(body.getBoundingClientRect().width - before);
    body.style.paddingRight = `${Math.max(0, widened)}px`;
  });
  expect(await layout(page)).toEqual(short);
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);

  // Without the reserved gutter a short page here is wider than a long one,
  // so the checks above measured something real.
  await page.evaluate(() => {
    document.documentElement.style.overflow = "";
    document.body.style.paddingRight = "";
    document.getElementById("filler")!.remove();
    document.documentElement.style.scrollbarGutter = "auto";
  });
  expect((await layout(page)).width).toBe(short.width + scrollbarWidth);
});

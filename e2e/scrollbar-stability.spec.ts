import { expect, test, type Page } from "@playwright/test";
import { waitForClientHydration } from "./helpers/auth";

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
  await waitForClientHydration(page);

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

test("a page that scrolls inside its own box gives that box the reserved space", async ({
  page,
}) => {
  await page.goto("/login");
  await waitForClientHydration(page);

  const scrollbarWidth = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;top:0;width:100px;height:100px;overflow:scroll";
    document.body.append(probe);
    const width = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return width;
  });
  test.skip(scrollbarWidth === 0, "this browser draws overlay scrollbars, which take no width");

  const widths = () =>
    page.evaluate(() => {
      const box = document.getElementById("own-scroll")!;
      return {
        body: Math.round(document.body.getBoundingClientRect().width),
        box: Math.round(box.getBoundingClientRect().width),
        boxContent: box.clientWidth,
      };
    });

  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "own-scroll";
    box.className = "dg-own-scroll";
    // Pinned, so the sign-in page does not grow tall enough to scroll.
    box.style.cssText = "position:fixed;top:0;left:0;right:0;height:200px";
    box.innerHTML = '<div style="height:50px"></div>';
    document.body.prepend(box);
  });
  const viewport = await page.evaluate(() => innerWidth);
  const short = await widths();
  // <html> lets go of its gutter, so the box and its scrollbar reach the edge.
  expect(short.body).toBe(viewport);
  expect(short.box).toBe(viewport);
  expect(short.boxContent).toBe(viewport - scrollbarWidth);

  await page.evaluate(() => {
    document
      .getElementById("own-scroll")!
      .firstElementChild!.setAttribute("style", "height:2000px");
  });
  expect(await widths()).toEqual(short);
});

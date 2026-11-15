import { afterEach, describe, expect, it, vi } from "vitest";
import { lockPageScroll } from "./page-scroll-lock";

const html = document.documentElement;
const body = document.body;

// How much wider the page gets once <html> is hidden: a scrollbar's width
// when the browser drops the gutter, 0 when it keeps it or draws overlays.
function setWidening(width: number) {
  vi.spyOn(body, "getBoundingClientRect").mockImplementation(
    () => ({ width: html.style.overflow === "hidden" ? 1280 : 1280 - width }) as DOMRect,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  html.style.overflow = "";
  body.style.paddingRight = "";
});

describe("lockPageScroll", () => {
  it("locks <html> and pads the body by however much wider the page got", () => {
    setWidening(15);
    const unlock = lockPageScroll();
    expect(html.style.overflow).toBe("hidden");
    expect(body.style.paddingRight).toBe("15px");
    unlock();
    expect(html.style.overflow).toBe("");
    expect(body.style.paddingRight).toBe("");
  });

  it("adds no padding when the width holds", () => {
    setWidening(0);
    const unlock = lockPageScroll();
    expect(html.style.overflow).toBe("hidden");
    expect(body.style.paddingRight).toBe("");
    unlock();
  });

  it("stays locked until the last of stacked locks releases", () => {
    setWidening(15);
    const first = lockPageScroll();
    const second = lockPageScroll();
    first();
    first();
    expect(html.style.overflow).toBe("hidden");
    expect(body.style.paddingRight).toBe("15px");
    second();
    expect(html.style.overflow).toBe("");
    expect(body.style.paddingRight).toBe("");
  });

  it("restores styles that were set before the lock", () => {
    setWidening(15);
    html.style.overflow = "clip";
    body.style.paddingRight = "4px";
    const unlock = lockPageScroll();
    expect(body.style.paddingRight).toBe("19px");
    unlock();
    expect(html.style.overflow).toBe("clip");
    expect(body.style.paddingRight).toBe("4px");
  });
});

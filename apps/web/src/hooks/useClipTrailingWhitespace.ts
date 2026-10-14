import { useEffect, useState } from "react";

/** Set on a scroller whose only scrollable distance is empty bottom padding. */
export const SCROLL_FITS_ATTRIBUTE = "data-dg-scroll-fits";

// Nested wrapper padding adds up to about 75px today. Anything past this is
// real overflow, which also keeps the full content scan off long pages.
const MAX_TRAILING_WHITESPACE_PX = 160;

const REPLACED_ELEMENTS = new Set([
  "img",
  "svg",
  "canvas",
  "video",
  "iframe",
  "input",
  "textarea",
  "select",
  "button",
  "hr",
]);

type BoxStyle = Pick<
  CSSStyleDeclaration,
  "backgroundColor" | "backgroundImage" | "boxShadow" | "borderTopWidth" | "borderBottomWidth"
>;

function isTransparent(color: string): boolean {
  return !color || color === "transparent" || /^rgba\(.*,\s*0\)$/.test(color);
}

/**
 * Whether a box is drawn on screen, so its bottom edge is something a reader
 * sees. A layout wrapper filled with the page's own background is not.
 */
export function paintsBox(style: BoxStyle, pageBackgrounds: ReadonlySet<string>): boolean {
  const background = style.backgroundColor;
  return (
    (!isTransparent(background) && !pageBackgrounds.has(background)) ||
    (Boolean(style.backgroundImage) && style.backgroundImage !== "none") ||
    (Boolean(style.boxShadow) && style.boxShadow !== "none") ||
    parseFloat(style.borderTopWidth) > 0 ||
    parseFloat(style.borderBottomWidth) > 0
  );
}

function hasOwnText(element: Element): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

function clipsChildren(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowY].some((value) => /hidden|auto|scroll|clip/.test(value));
}

/**
 * The lowest visible content inside `root`, in viewport coordinates: text,
 * replaced elements, and painted boxes. Padding and margins of unpainted
 * wrappers do not count, which is what separates content from whitespace.
 */
export function measureContentBottom(root: Element, pageBackgrounds: ReadonlySet<string>): number {
  let bottom = 0;
  for (const child of root.children) {
    const style = getComputedStyle(child);
    if (style.display === "none" || style.position === "fixed") continue;

    const rect = child.getBoundingClientRect();
    const hasArea = rect.width > 0 && rect.height > 0;
    const replaced = REPLACED_ELEMENTS.has(child.localName);
    if (
      hasArea &&
      style.visibility !== "hidden" &&
      (replaced || hasOwnText(child) || paintsBox(style, pageBackgrounds))
    ) {
      bottom = Math.max(bottom, rect.bottom);
    }
    if (replaced) continue;

    const inner = measureContentBottom(child, pageBackgrounds);
    bottom = Math.max(bottom, clipsChildren(style) ? Math.min(inner, rect.bottom) : inner);
  }
  return bottom;
}

/** True when scrolling would reveal padding and nothing else. */
export function revealsOnlyWhitespace(scroll: {
  scrollHeight: number;
  clientHeight: number;
  contentBottom: () => number;
}): boolean {
  const overflow = scroll.scrollHeight - scroll.clientHeight;
  if (overflow <= 0 || overflow > MAX_TRAILING_WHITESPACE_PX) return false;
  return scroll.contentBottom() <= scroll.clientHeight + 1;
}

function useScrollFitsAttribute(target: HTMLElement | "page" | null) {
  useEffect(() => {
    const isPage = target === "page";
    const scroller = isPage ? document.scrollingElement : target;
    if (!(scroller instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;
    const contentRoot = isPage ? document.body : scroller;
    let frame = 0;

    const update = () => {
      frame = 0;
      const fits = revealsOnlyWhitespace({
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        contentBottom: () => {
          const backgrounds = new Set([
            getComputedStyle(document.body).backgroundColor,
            getComputedStyle(scroller).backgroundColor,
          ]);
          // Where scroll offset 0 sits in the viewport, so the result is in
          // the scroller's own coordinates.
          const origin = isPage
            ? -scroller.scrollTop
            : scroller.getBoundingClientRect().top + scroller.clientTop - scroller.scrollTop;
          return measureContentBottom(contentRoot, backgrounds) - origin;
        },
      });
      if (fits === scroller.hasAttribute(SCROLL_FITS_ATTRIBUTE)) return;
      if (fits) {
        scroller.setAttribute(SCROLL_FITS_ATTRIBUTE, "");
        scroller.scrollTop = 0;
      } else {
        scroller.removeAttribute(SCROLL_FITS_ATTRIBUTE);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    resize.observe(contentRoot);
    for (const child of contentRoot.children) resize.observe(child);
    // A swapped view can keep the old scroll height while moving its content.
    const mutations = new MutationObserver(schedule);
    mutations.observe(contentRoot, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      scroller.removeAttribute(SCROLL_FITS_ATTRIBUTE);
    };
  }, [target]);
}

/**
 * Stops the page from scrolling when everything below the fold is bottom
 * padding, so it scrolls only when there is more to see. Pages that do
 * overflow keep their padding.
 */
export function useClipPageTrailingWhitespace() {
  useScrollFitsAttribute("page");
}

/** The same for an element scroller; attach the returned ref to it. */
export function useClipTrailingWhitespace() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  useScrollFitsAttribute(scroller);
  return setScroller;
}

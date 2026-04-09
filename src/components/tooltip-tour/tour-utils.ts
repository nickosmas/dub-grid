/** Interval (ms) for polling when a tour target is obscured by a modal/panel. */
export const OCCLUSION_POLL_MS = 400;

/** CSS selectors that match tour overlay elements (spotlight, popover, entry modal). */
const TOUR_LAYER_SELECTORS = ".tour-popover, .tour-entry-backdrop, .tour-spotlight-overlay";

/**
 * Returns true if `el` is the topmost interactive element at its center point.
 * Temporarily hides tour layers so `elementFromPoint` doesn't hit them.
 */
export function isElementVisible(el: Element, rect: DOMRect): boolean {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Temporarily disable pointer-events on tour layers so they don't intercept the hit test
  const tourEls = document.querySelectorAll(TOUR_LAYER_SELECTORS);
  const saved: { el: HTMLElement; prev: string }[] = [];
  tourEls.forEach((te) => {
    if (te instanceof HTMLElement) {
      saved.push({ el: te, prev: te.style.pointerEvents });
      te.style.pointerEvents = "none";
    }
  });

  const topEl = document.elementFromPoint(cx, cy);

  // Restore pointer-events
  saved.forEach(({ el: te, prev }) => {
    te.style.pointerEvents = prev;
  });

  if (!topEl) return false;
  return el === topEl || el.contains(topEl) || topEl.contains(el);
}

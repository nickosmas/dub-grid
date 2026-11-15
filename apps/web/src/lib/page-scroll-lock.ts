/**
 * Stops the page scrolling behind a panel or sheet without moving it.
 *
 * The lock goes on <html>: globals.css gives it its own overflow so Chromium
 * keeps the scrollbar gutter, which also means an overflow on <body> no
 * longer reaches the viewport. Whether a hidden <html> keeps that gutter
 * varies, so the body is padded by however much wider the page became.
 * Reference-counted so stacked panels don't unlock each other.
 */
let lockCount = 0;
let previousOverflow = "";
let previousBodyPaddingRight = "";

export function lockPageScroll(): () => void {
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    previousOverflow = html.style.overflow;
    previousBodyPaddingRight = body.style.paddingRight;
    // The body's box, not html.clientWidth: Chromium reports the full width
    // for a hidden <html> even while it still reserves the gutter.
    const widthBefore = body.getBoundingClientRect().width;
    html.style.overflow = "hidden";
    const widened = Math.round(body.getBoundingClientRect().width - widthBefore);
    if (widened > 0) {
      const currentPaddingRight = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPaddingRight + widened}px`;
    }
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
    }
  };
}

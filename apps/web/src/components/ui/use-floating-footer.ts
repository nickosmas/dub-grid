"use client";

import { useEffect, useState, type RefObject } from "react";

/** The element a sticky footer sticks within, skipping `display: contents` wrappers. */
export function footerSection(footer: HTMLElement): HTMLElement | null {
  let section = footer.parentElement;
  while (section && getComputedStyle(section).display === "contents") {
    section = section.parentElement;
  }
  return section;
}

/**
 * Whether a `position: sticky` footer is floating: lifted above the inner end
 * of its section, where it otherwise rests as the section's last child. Off while
 * `enabled` is false.
 */
export function useFloatingFooter(
  footerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): boolean {
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    const footer = footerRef.current;
    const section = footer && enabled ? footerSection(footer) : null;
    if (!footer || !section) {
      setFloating(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(section);
      const innerBottom =
        section.getBoundingClientRect().bottom -
        parseFloat(style.borderBottomWidth) -
        parseFloat(style.paddingBottom);
      setFloating(innerBottom - footer.getBoundingClientRect().bottom > 1);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(section);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    };
  }, [footerRef, enabled]);

  return floating;
}

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

/** How far a floating footer sits above the bottom of the screen, as from the sides. */
export const FLOATING_FOOTER_GAP_PX = 8;

function scrollPort(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

/**
 * A sticky box stays inside its scroll area's padding, so the bottom offset
 * reaches back into that padding to sit the gap above the screen's edge. At the
 * end of the scroll area the footer still rests at its natural place.
 */
function placeAboveScreenEdge(footer: HTMLElement, port: HTMLElement | null) {
  const padding = port ? parseFloat(getComputedStyle(port).paddingBottom) || 0 : 0;
  footer.style.setProperty("--dg-floating-footer-bottom", `${FLOATING_FOOTER_GAP_PX - padding}px`);
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
    const port = scrollPort(section);
    let frame = 0;
    const measure = () => {
      frame = 0;
      placeAboveScreenEdge(footer, port);
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
      footer.style.removeProperty("--dg-floating-footer-bottom");
    };
  }, [footerRef, enabled]);

  return floating;
}

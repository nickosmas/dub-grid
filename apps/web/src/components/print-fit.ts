import type { CSSProperties } from "react";

/**
 * Printed text is never cut off: a label too wide for its box is set smaller
 * until it fits. Each `[data-print-fit]` element is a full-width block whose
 * children size themselves in em, so scaling the block scales its whole line.
 *
 * The print window runs no script, so this runs on the preview, which lays
 * out at the printed page width, and the sizes travel with the copied markup.
 */
export const PRINT_FIT_SELECTOR = "[data-print-fit]";

/** A fit line: full width, one line, its overflow measured rather than shown. */
export const PRINT_FIT_LINE: CSSProperties = {
  display: "block",
  width: "100%",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

// Below this a label stops being legible on paper; it would clip rather
// than shrink further, which no realistic label at a supported size reaches.
export const PRINT_FIT_MIN_SCALE = 0.3;

const MAX_PASSES = 3;

/** The scale that brings `natural` within `available`, never above 1 or below `floor`. */
export function fitScale(
  available: number,
  natural: number,
  current = 1,
  floor = PRINT_FIT_MIN_SCALE,
): number {
  if (natural <= available + 0.5 || natural <= 0) return current;
  return Math.max(floor, (current * available) / natural);
}

export function fitPrintText(root: ParentNode): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(PRINT_FIT_SELECTOR));
  for (const element of elements) element.style.fontSize = "";
  const scales = elements.map(() => 1);

  // A wrapping label can rewrap once it shrinks, so settle over a few passes.
  // Each pass reads every width before writing any, to lay out only once.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = elements.map((element, i) =>
      fitScale(element.clientWidth, element.scrollWidth, scales[i]),
    );
    if (next.every((scale, i) => scale === scales[i])) return;
    next.forEach((scale, i) => {
      scales[i] = scale;
      elements[i].style.fontSize = scale < 1 ? `${scale}em` : "";
    });
  }
}

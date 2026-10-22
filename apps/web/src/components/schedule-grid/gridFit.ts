import type { CSSProperties } from "react";
import { fitScale } from "@/components/print-fit";

/**
 * A grid pill's text is never cut off: a line too wide for its pill is set
 * smaller until it fits. Each fit line is a full-width block whose size is its
 * base token times `--dg-grid-fit-scale`; text inside it takes its own token
 * at that inherited scale (`gridFitSize`) or sizes itself in em, so one
 * property scales the whole line. (`data-grid-fit` is taken: the grid root
 * uses it to say whether the grid fits its container.)
 */
export const GRID_FIT_ATTR = "data-pill-fit";
export const GRID_FIT_FLOOR_ATTR = "data-pill-fit-floor";
const GRID_FIT_SELECTOR = `[${GRID_FIT_ATTR}]`;
const SCALE_PROPERTY = "--dg-grid-fit-scale";

// Half size, like mobile's FitText: past it a label ellipsizes rather than
// shrinking into illegibility.
export const GRID_FIT_MIN_SCALE = 0.5;

const MAX_PASSES = 3;

/**
 * A type token at the line's fit scale. The scale is inherited, so text inside
 * a fit line keeps its own token and still shrinks with the line.
 */
export function gridFitSize(token: string): string {
  return `calc(${token} * var(${SCALE_PROPERTY}, 1))`;
}

/**
 * A fit line at `baseSize` (a type token): full width, its overflow measured
 * rather than shown. One line unless `wrap`, which lets a name break between
 * words; a word wider than the line still overflows, so it shrinks instead of
 * breaking.
 */
export function gridFitLine(baseSize: string, { wrap = false } = {}): CSSProperties {
  return {
    display: "block",
    width: "100%",
    minWidth: 0,
    whiteSpace: wrap ? "normal" : "nowrap",
    overflowWrap: "normal",
    overflow: "hidden",
    textAlign: "center",
    fontSize: gridFitSize(baseSize),
  };
}

export interface GridFitResult {
  /** The smallest scale any line took; 1 when every line fits. */
  smallestScale: number;
  /** Lines still too wide at the floor, now ellipsized. */
  atFloor: number;
}

/**
 * Fits every line under `root`. Each pass reads every width before writing
 * any scale, so the browser lays out once per pass rather than once per line.
 */
export function fitGridText(root: ParentNode): GridFitResult {
  const lines = Array.from(root.querySelectorAll<HTMLElement>(GRID_FIT_SELECTOR));
  for (const line of lines) {
    line.style.removeProperty(SCALE_PROPERTY);
    line.style.textOverflow = "";
    line.removeAttribute(GRID_FIT_FLOOR_ATTR);
  }
  const scales = lines.map(() => 1);

  // A line can measure differently once it shrinks, so settle over a few passes.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = lines.map((line, i) =>
      fitScale(line.clientWidth, line.scrollWidth, scales[i], GRID_FIT_MIN_SCALE),
    );
    if (next.every((scale, i) => scale === scales[i])) break;
    next.forEach((scale, i) => {
      scales[i] = scale;
      if (scale < 1) lines[i].style.setProperty(SCALE_PROPERTY, String(scale));
    });
  }

  const overflowing = lines.map((line) => line.scrollWidth > line.clientWidth + 0.5);
  let atFloor = 0;
  overflowing.forEach((over, i) => {
    if (!over) return;
    atFloor += 1;
    lines[i].style.textOverflow = "ellipsis";
    lines[i].setAttribute(GRID_FIT_FLOOR_ATTR, "");
  });
  return { smallestScale: Math.min(1, ...scales), atFloor };
}

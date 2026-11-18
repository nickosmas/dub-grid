import type { HingeStatus } from "./useHingeStatus";

/** Narrower than this (the closed iPhone Duo, any phone) shows one page at a time. */
export const SPLIT_MIN_WIDTH = 600;
/** The narrowest regular-width screen, an iPad mini held tall. */
const WIDE_MIN_WIDTH = 744;
const WIDE_LIST_WIDTH = 360;
const NARROW_LIST_WIDTH = 300;

export type SplitLayout = { listWidth: number };

/**
 * How a page splits into list and detail (Apple's split view): not at all
 * on a phone-width screen; at the fold when the Duo is partly folded and
 * held wide, so each pane fills its half; otherwise a fixed list, narrower
 * when held tall.
 */
export function getSplitLayout({
  width,
  height,
  hinge,
}: {
  width: number;
  height: number;
  hinge: HingeStatus;
}): SplitLayout | null {
  if (width < SPLIT_MIN_WIDTH) return null;
  if (hinge === "partiallyOpen" && width > height) return { listWidth: Math.round(width / 2) };
  return { listWidth: width >= WIDE_MIN_WIDTH ? WIDE_LIST_WIDTH : NARROW_LIST_WIDTH };
}

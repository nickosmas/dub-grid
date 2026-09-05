import { StyleSheet } from "react-native";

/**
 * Where a page-owning empty or error state sits in the space it is handed.
 *
 * Dead centre reads badly on a tall phone. These states appear under a header
 * and often a filter row, and centring in *all* the remaining space marooned
 * the message in the middle of a void, a long way from the controls it belongs
 * to — a filter tab strip stranded at the top with nothing near it.
 *
 * Two flex spacers rather than a fixed offset, so the message lands at the same
 * fraction of the space on every screen size instead of drifting between a
 * small phone and a tablet. The weights put it a little above centre: still
 * clearly the subject of the page, but within the same glance as whatever sits
 * above it.
 */
const SPACE_ABOVE = 2;
const SPACE_BELOW = 3;

/**
 * How far down the available space the message sits, as a fraction.
 *
 * Exported because the styles themselves aren't assertable — the test harness
 * drops `style` before it reaches the tree — and this ratio is the part worth
 * pinning: the whole point of the change is that it stays below `0.5`.
 */
export const FILL_SCREEN_ANCHOR_FRACTION = SPACE_ABOVE / (SPACE_ABOVE + SPACE_BELOW);

export const fillScreenAnchorStyles = StyleSheet.create({
  /** Applied to the state's own root so it claims the leftover space. */
  fill: {
    flex: 1,
  },
  spacerAbove: {
    flex: SPACE_ABOVE,
  },
  spacerBelow: {
    flex: SPACE_BELOW,
  },
});

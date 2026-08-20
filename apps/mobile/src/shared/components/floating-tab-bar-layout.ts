/**
 * Geometry of the floating tab bar, shared by the bar itself and by the screens
 * that have to clear it.
 *
 * The bar is absolutely positioned, so it takes no layout height of its own and
 * content scrolls *under* it. A screen's bottom padding is the only thing
 * keeping its last row out from behind the bar, and the two drifting apart is
 * invisible right up until the final control on a page ends up tucked
 * underneath with no scroll left to reveal it.
 */

/** Height of the bar pill itself. */
export const FLOATING_TAB_BAR_HEIGHT = 68;

/** Gap between the bottom of the bar and the safe-area edge below it. */
export const FLOATING_TAB_BAR_BOTTOM_GAP = 6;

/**
 * Floor for the safe-area inset, so the bar still reads as floating on a device
 * that reports no bottom inset at all rather than sitting flush to the edge.
 */
export const FLOATING_TAB_BAR_MIN_BOTTOM_INSET = 8;

/** How far the bar is lifted off the bottom of the window. */
export function getFloatingTabBarMarginBottom(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, FLOATING_TAB_BAR_MIN_BOTTOM_INSET) + FLOATING_TAB_BAR_BOTTOM_GAP;
}

/** Distance from the bottom of the window to the top edge of the bar. */
export function getFloatingTabBarClearance(safeAreaBottom: number): number {
  return getFloatingTabBarMarginBottom(safeAreaBottom) + FLOATING_TAB_BAR_HEIGHT;
}

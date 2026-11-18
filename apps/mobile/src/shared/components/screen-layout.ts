import { Platform } from "react-native";
import { mobileSpacing } from "../theme/tokens";

/**
 * The horizontal gutter every screen's content sits on.
 *
 * It has to line up with the leading edge of the navigation bar's title, which
 * is the platform's number, not ours. iOS insets a large title by 20; on the
 * shared 16 the first thing under it — a hero's meta row, a row of action
 * buttons — sat a few points to its left. Android's Material top app bar starts
 * its title at 16, so it keeps the shared value.
 *
 * Anything that has to agree with this gutter reads it from here: `Screen`'s
 * content padding, `ScrollableTabStrip`'s bleed (which cancels it with a
 * negative margin and re-adds it inside). A literal 16 in either silently
 * breaks the alignment on iOS.
 *
 * A function, not a constant, because `Platform` is mocked per test with a lazy
 * getter — reading it at module scope throws before the mock is initialized.
 */
export function getScreenGutter(): number {
  return Platform.OS === "ios" ? IOS_LARGE_TITLE_INSET : mobileSpacing.screenX;
}

/** What UIKit insets a large title by. */
const IOS_LARGE_TITLE_INSET = 20;

/**
 * Where the camera's centre sits when the status bar stands in a side column
 * (iPhone Duo closed or open), and where a top row (8 above a 44-point row)
 * centres without help. Measured on the simulator: camera 47.7, wordmark 30.5.
 */
const SIDE_COLUMN_CAMERA_CENTRE = 48;
const TOP_ROW_CENTRE = 30;

/**
 * Extra room above a screen's top row so it lines up with the camera when
 * the status bar has moved to a side column and the top inset is 0. Nothing
 * on a screen with a top inset. `rowCentre` is where the row centres
 * without help, for a row that isn't the usual 44.
 */
export function getSideColumnTopOffset(
  insets: { top: number; left: number; right: number },
  rowCentre = TOP_ROW_CENTRE,
): number {
  const sideColumn = insets.top <= 0 && (insets.left > 0 || insets.right > 0);
  return sideColumn ? Math.max(SIDE_COLUMN_CAMERA_CENTRE - rowCentre, 0) : 0;
}

/**
 * Leading and trailing padding that keeps content clear of the side safe
 * area. On iPhone Duo the status bar, camera and tab bar stand in a column on
 * the trailing edge, and UIKit doesn't inset a scroll view's content for it.
 * `base` is the gutter to add on top, or 0 where something inside already
 * pads by it.
 */
export function getScreenSidePadding(
  insets: { left: number; right: number },
  base = 0,
): { paddingLeft: number; paddingRight: number } {
  return {
    paddingLeft: base + Math.max(insets.left, 0),
    paddingRight: base + Math.max(insets.right, 0),
  };
}

export type ScreenBottomPaddingMode = "tabbed" | "stack" | "modal";

const SCREEN_BOTTOM_PADDING = {
  // iOS and web keep a tab bar that the platform itself insets the scroll view
  // for (a native `NativeTabs` bar, or react-navigation's own in-flow one), so
  // this is breathing room over the top of that, not clearance for it.
  tabbed: 72,
  stack: 24,
  modal: 16,
} as const;

/**
 * Room between a screen's last row and Android's bottom navigation. The bar
 * is in the layout, below the screen, and keeps the system navigation inset
 * for itself, so this is breathing room and nothing else.
 */
const ANDROID_TAB_BAR_BREATHING_ROOM = 24;

export const DEFAULT_SCREEN_BOTTOM_PADDING_MODE: ScreenBottomPaddingMode = "stack";

export function getScreenBottomPadding(
  mode: ScreenBottomPaddingMode,
  safeAreaBottom: number,
): number {
  const safeArea = Math.max(safeAreaBottom, 0);

  if (mode === "tabbed" && Platform.OS === "android") {
    return ANDROID_TAB_BAR_BREATHING_ROOM;
  }

  return safeArea + SCREEN_BOTTOM_PADDING[mode];
}

/** Modest, fixed breathing room below a sticky footer — see `getFooterBottomPadding`. */
const FOOTER_BOTTOM_BREATHING_ROOM = 16;

/** The tallest bottom inset a screen with nothing below it can honestly have. */
const HOME_INDICATOR_INSET = 34;

/** The content height of UIKit's standard bottom tab bar, excluding the safe area. */
const IOS_NATIVE_TAB_BAR_CONTENT_HEIGHT = 49;

/**
 * Bottom padding for a *sticky* `Screen` footer, as opposed to
 * `getScreenBottomPadding`'s padding on trailing scroll content.
 *
 * A footer is permanently visible, not invisible space past the end of a
 * scroll. Native iOS routes can report either the physical safe area or an
 * inset already enlarged by the tab bar, so visible-bar clearance normalizes
 * both shapes instead of assuming one. Android's floating tab bar still uses
 * its measured footprint.
 */
export function getFooterBottomPadding(
  mode: ScreenBottomPaddingMode,
  safeAreaBottom: number,
  nativeTabBarVisible = false,
): number {
  const safeArea = Math.max(safeAreaBottom, 0);

  if (mode === "tabbed" && Platform.OS === "android") {
    return FOOTER_BOTTOM_BREATHING_ROOM;
  }

  if (Platform.OS === "ios" && nativeTabBarVisible) {
    const nativeTabClearance =
      safeArea > HOME_INDICATOR_INSET ? safeArea : safeArea + IOS_NATIVE_TAB_BAR_CONTENT_HEIGHT;

    return nativeTabClearance + FOOTER_BOTTOM_BREATHING_ROOM;
  }

  // A tab-hidden route can still inherit an enlarged inset from the navigator
  // that presented it. Nothing remains below its footer but the home indicator.
  const clearance = Math.min(safeArea, HOME_INDICATOR_INSET);

  return clearance + FOOTER_BOTTOM_BREATHING_ROOM;
}

import { Platform } from "react-native";
import { mobileSpacing } from "../theme/tokens";
import { getFloatingTabBarClearance } from "./floating-tab-bar-layout";

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
 * negative margin and re-adds it inside), and `FloatingTabBar`'s inset. A
 * literal 16 in any of them silently breaks the alignment on iOS.
 *
 * A function, not a constant, because `Platform` is mocked per test with a lazy
 * getter — reading it at module scope throws before the mock is initialized.
 */
export function getScreenGutter(): number {
  return Platform.OS === "ios" ? IOS_LARGE_TITLE_INSET : mobileSpacing.screenX;
}

/** What UIKit insets a large title by. */
const IOS_LARGE_TITLE_INSET = 20;

export type ScreenBottomPaddingMode = "tabbed" | "stack" | "modal";

const SCREEN_BOTTOM_PADDING = {
  // iOS and web keep a tab bar that the platform itself insets the scroll view
  // for (a native `NativeTabs` bar, or react-navigation's own in-flow one), so
  // this is breathing room over the top of that, not clearance for it.
  tabbed: 72,
  stack: 24,
  modal: 16,
} as const;

/** Breathing room between a screen's last row and the floating bar above it. */
const FLOATING_TAB_BAR_BREATHING_ROOM = 16;

export const DEFAULT_SCREEN_BOTTOM_PADDING_MODE: ScreenBottomPaddingMode = "stack";

export function getScreenBottomPadding(
  mode: ScreenBottomPaddingMode,
  safeAreaBottom: number,
): number {
  const safeArea = Math.max(safeAreaBottom, 0);

  // Android's tab bar is `FloatingTabBar` — absolutely positioned, taking no
  // layout height, with content scrolling under it. Measure its real footprint
  // instead of restating a constant that has to be kept in step with it by
  // hand: the flat 72 was already shorter than the bar itself, so a screen
  // whose last element sat flush against the end of its content (Profile's
  // "Switch organization", the save row on the settings screens) stayed tucked
  // behind the bar with nothing left to scroll.
  if (mode === "tabbed" && Platform.OS === "android") {
    return getFloatingTabBarClearance(safeArea) + FLOATING_TAB_BAR_BREATHING_ROOM;
  }

  return safeArea + SCREEN_BOTTOM_PADDING[mode];
}

/** Modest, fixed breathing room below a sticky footer — see `getFooterBottomPadding`. */
const FOOTER_BOTTOM_BREATHING_ROOM = 16;

/**
 * Bottom padding for a *sticky* `Screen` footer, as opposed to
 * `getScreenBottomPadding`'s padding on trailing scroll content.
 *
 * A footer is permanently visible, not invisible space past the end of a
 * scroll, so it can't reuse `tabbed` mode's iOS number unchanged: on iOS the
 * tab bar already inflates `safeAreaBottom` itself (the comment above
 * explains why `tabbed` skips real clearance there), so stacking that mode's
 * 72pt "breathing room" on top of an already tab-bar-sized inset reads as a
 * wall of dead space under the footer, not a gap above a tab bar the footer
 * was never behind in the first place. Android's floating tab bar still needs
 * its real clearance, since nothing else keeps a footer out from behind it.
 */
export function getFooterBottomPadding(
  mode: ScreenBottomPaddingMode,
  safeAreaBottom: number,
): number {
  const safeArea = Math.max(safeAreaBottom, 0);

  if (mode === "tabbed" && Platform.OS === "android") {
    return getFloatingTabBarClearance(safeArea) + FLOATING_TAB_BAR_BREATHING_ROOM;
  }

  return safeArea + FOOTER_BOTTOM_BREATHING_ROOM;
}

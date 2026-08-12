import { Platform } from "react-native";
import { getFloatingTabBarClearance } from "./floating-tab-bar-layout";

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

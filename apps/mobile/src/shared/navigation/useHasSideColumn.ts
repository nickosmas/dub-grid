import { createContext, useContext } from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { hasSideColumn } from "../components/screen-layout";

/**
 * The window's own safe-area insets, for code inside a split view's pane,
 * where `SplitView` trims each pane's insets to the edges it touches.
 */
export const WindowInsetsContext = createContext<EdgeInsets | null>(null);

/**
 * Whether the navigation bar's trailing items stand in the iPhone Duo's side
 * column, where only symbols fit. Read from the window, not the pane: a split
 * view's list pane doesn't touch the column, but its bar items still go there.
 */
export function useHasSideColumn(): boolean {
  return hasSideColumn(useWindowInsets());
}

/** The window's insets inside a split view's pane, or the screen's own outside one. */
export function useWindowInsets(): EdgeInsets {
  const paneInsets = useSafeAreaInsets();
  return useContext(WindowInsetsContext) ?? paneInsets;
}

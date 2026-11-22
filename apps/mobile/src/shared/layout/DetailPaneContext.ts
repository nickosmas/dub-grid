import { createContext, useContext } from "react";

/**
 * True inside a split view's detail pane. The pane sits under the list's
 * native navigation bar, whose height changes as the list's large title
 * folds, so a page there pads its own top instead of taking UIKit's inset.
 */
export const DetailPaneContext = createContext(false);

export function useInDetailPane(): boolean {
  return useContext(DetailPaneContext);
}

/**
 * How far a split pane's top sits below the window's, when the pane is drawn
 * as a card inset from the screen; a page's top row subtracts it so it still
 * lines up with the camera.
 */
export const PaneTopInsetContext = createContext(0);

export function usePaneTopInset(): number {
  return useContext(PaneTopInsetContext);
}

/**
 * The height of a native bar the detail pane sits under, when the list's page
 * shows one (People's large title): the pane's page starts below it and
 * scrolls up under it, as a page does under its own bar.
 */
export const DetailBarClearanceContext = createContext(0);

export function useDetailBarClearance(): number {
  return useContext(DetailBarClearanceContext);
}

/**
 * True under a page's own header that spans both panes (Home on the open
 * iPhone Duo): the panes start right under it, so the detail pane's top row
 * no longer lines up with the camera in the side column.
 */
export const HeaderAbovePanesContext = createContext(false);

export function useHeaderAbovePanes(): boolean {
  return useContext(HeaderAbovePanesContext);
}

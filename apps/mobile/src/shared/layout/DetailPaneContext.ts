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

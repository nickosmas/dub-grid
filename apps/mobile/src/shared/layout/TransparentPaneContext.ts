import { createContext, useContext } from "react";

/**
 * True inside a split view that paints one background behind both panes
 * (Home's wash on an open iPhone Duo): each page then leaves its own ground
 * transparent, so the wash runs across the divider unbroken.
 */
export const TransparentPaneContext = createContext(false);

export function useTransparentPane(): boolean {
  return useContext(TransparentPaneContext);
}

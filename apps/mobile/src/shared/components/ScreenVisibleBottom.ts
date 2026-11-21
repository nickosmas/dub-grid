import { createContext, useContext } from "react";

/**
 * Where a `Screen`'s visible area ends, in window coordinates: above the tab
 * bar or footer that covers its foot. Null outside a `Screen` or before it is
 * measured.
 */
export const ScreenVisibleBottomContext = createContext<number | null>(null);

export function useScreenVisibleBottom(): number | null {
  return useContext(ScreenVisibleBottomContext);
}

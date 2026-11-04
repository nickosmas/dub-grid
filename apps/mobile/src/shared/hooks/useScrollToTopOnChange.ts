import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ScreenScrollHandle } from "../components/Screen";

/**
 * Opens a page at its top whenever `key` changes (another day, week or view),
 * instead of where the last one was left. It runs before paint, so the new
 * content never shows at the old offset first.
 */
export function useScrollToTopOnChange(
  scrollViewRef: RefObject<ScreenScrollHandle | null>,
  key: string,
) {
  const previousKeyRef = useRef(key);
  useLayoutEffect(() => {
    if (previousKeyRef.current === key) return;
    previousKeyRef.current = key;
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [key, scrollViewRef]);
}

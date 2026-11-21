import { useCallback, useEffect, useState, type RefObject } from "react";
import { useWindowDimensions, type View } from "react-native";
import { FOLD_FADE_MS } from "./FoldFade";

/**
 * A view's top in the window. A pose change can move a view without changing
 * its own frame, so `onLayout` alone left a stale top; this measures again
 * whenever the window changes size, as the pose starts to settle and once it
 * has.
 */
export function useWindowTop(
  ref: RefObject<View | null>,
  enabled: boolean,
): [top: number | null, measure: () => void] {
  const { width, height } = useWindowDimensions();
  const [top, setTop] = useState<number | null>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => setTop((current) => (current === y ? current : y)));
  }, [ref]);
  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(measure);
    const settled = setTimeout(measure, FOLD_FADE_MS + 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [enabled, width, height, measure]);
  return [top, measure];
}

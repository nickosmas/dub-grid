import { useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** How far the page scrolls before iOS has folded the large title into the bar. */
const LARGE_TITLE_FOLD = 44;

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/**
 * Whether a screen's large title has collapsed into the bar, for a bar item
 * that only belongs there once it has. The page rests where its first drag
 * starts (iOS insets it under the bar, title and search field), so the title
 * has folded once the page is a title's height past that.
 */
export function useLargeTitleCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const restYRef = useRef<number | null>(null);
  const onScrollBeginDrag = (event: ScrollEvent) => {
    const y = event.nativeEvent.contentOffset.y;
    restYRef.current = restYRef.current === null ? y : Math.min(restYRef.current, y);
  };
  const onScroll = (event: ScrollEvent) => {
    if (restYRef.current === null) return;
    const next = event.nativeEvent.contentOffset.y > restYRef.current + LARGE_TITLE_FOLD;
    setCollapsed((current) => (current === next ? current : next));
  };
  return { collapsed, onScroll, onScrollBeginDrag };
}

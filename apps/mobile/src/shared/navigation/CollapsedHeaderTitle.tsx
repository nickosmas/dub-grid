import { Stack } from "expo-router";
import { memo, useCallback, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/**
 * How far the page has to scroll before the native header adopts the page's
 * title, and how far back up before it lets go again.
 *
 * The two are deliberately different. With a single threshold, a finger parked
 * near it flips the title on and off every frame, and each flip reconfigures the
 * native header — which reads as a flashing header and a stuttering scroll. The
 * gap is what makes the change happen once per direction.
 */
const SHOW_TITLE_AT = 88;
const HIDE_TITLE_AT = 56;

/**
 * The native header's title, driven by scroll position.
 *
 * Split into its own memoized component so the title change re-renders *this*
 * and nothing else. Rendered inline, a detail screen re-ran its whole tree
 * mid-scroll — and, worse, handed the navigator a brand-new options object on
 * every unrelated render, so the native screen re-applied its animation,
 * gesture and content config over and over. Everything else about the header
 * is left to the layout's own options for the route.
 *
 * The large title is the one exception, and it has to be. On a route whose
 * layout asks for `headerLargeTitle` (every tab root does, via
 * `createTopLevelStackOptions`), iOS renders this title *as* the large title —
 * so the profile tab showed a blank large-title block that the display name
 * popped into halfway through a scroll. Driving the title from scroll position
 * and letting the platform also drive it are two answers to the same question;
 * this component is the one giving the answer.
 */
export const CollapsedHeaderTitle = memo(function CollapsedHeaderTitle({
  title,
}: {
  title: string;
}) {
  return (
    <Stack.Screen options={{ title, headerLargeTitle: false, headerLargeTitleEnabled: false }} />
  );
});

/**
 * Scroll state for `<CollapsedHeaderTitle>`: false until the page's own title
 * has scrolled away, true after.
 */
export function useCollapsedHeader(): {
  showCollapsedHeader: boolean;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const [showCollapsedHeader, setShowCollapsedHeader] = useState(false);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    setShowCollapsedHeader((current) => {
      const next = current ? offsetY > HIDE_TITLE_AT : offsetY > SHOW_TITLE_AT;
      // Bail out rather than re-render: this runs on every scroll frame.
      return next === current ? current : next;
    });
  }, []);

  return { showCollapsedHeader, handleScroll };
}

import { useRef, type PropsWithChildren } from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { FOLD_FADE_MS } from "./fold-timing";

export { FOLD_FADE_MS };

const FOLD_ENTERING = FadeIn.duration(FOLD_FADE_MS);

/**
 * The fade a page's layout makes when the iPhone Duo folds or opens, once
 * it has changed since the page first appeared: a page doesn't fade in when
 * it simply loads.
 */
export function useFoldEntering(isSplit: boolean): typeof FOLD_ENTERING | undefined {
  const first = useRef(isSplit);
  const changed = useRef(false);
  if (isSplit !== first.current) changed.current = true;
  return changed.current ? FOLD_ENTERING : undefined;
}

/**
 * A one-pane page fading in after the Duo folds. Only for a page whose header
 * is its own: an extra view above a native large title's scroll view stops
 * the title from collapsing.
 */
export function FoldFade({
  entering,
  children,
}: PropsWithChildren<{ entering: ReturnType<typeof useFoldEntering> }>) {
  return (
    <Animated.View entering={entering} style={styles.fill}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

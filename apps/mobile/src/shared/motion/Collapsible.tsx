import { useMemo, useState, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useMotionPreference } from "./useMotionPreference";
import { mobileMotion } from "../theme/tokens";

/**
 * Animated show/hide for a block of content.
 *
 * Replaces `LayoutAnimation.configureNext`, which is a global, fire-and-forget
 * API: it animates *every* layout change in the next frame, anywhere in the
 * tree, and on Android needs an opt-in flag set at startup. This is scoped to
 * one subtree and needs no global setup.
 *
 * ## Children stay mounted
 * Closed means height 0 with `overflow: hidden`, not unmounted. That keeps the
 * content queryable while collapsed (matching how the `LayoutAnimation` version
 * behaved) and avoids re-mounting it, with all the state loss that implies, on
 * every toggle.
 */
export function Collapsible({
  open,
  children,
  style,
  testID,
}: {
  open: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { timing } = useMotionPreference();
  const [contentHeight, setContentHeight] = useState(0);

  // Built on the JS thread, never inside the worklet below: Reanimated
  // serializes a captured non-worklet function as a remote-function *object*,
  // so calling `timing()` on the UI thread throws "timing is not a function
  // (it is Object)". Worklets may only close over the resulting plain config.
  const config = useMemo(() => timing("emphasized", mobileMotion.duration.base), [timing]);

  const containerStyle = useAnimatedStyle(
    () => ({
      height: withTiming(open ? contentHeight : 0, config),
      opacity: withTiming(open ? 1 : 0, config),
    }),
    [contentHeight, open, config],
  );

  return (
    <Animated.View
      // Until the content has been measured the height is 0, so nothing can
      // spill out during the first frame.
      style={[styles.container, containerStyle, style]}
      testID={testID}
    >
      <View
        onLayout={(event: LayoutChangeEvent) => {
          const next = event.nativeEvent.layout.height;
          if (next > 0 && next !== contentHeight) setContentHeight(next);
        }}
        // Absolute so its own height is measured independently of the animated
        // container's, which would otherwise feed back into itself.
        style={styles.measure}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  measure: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
});

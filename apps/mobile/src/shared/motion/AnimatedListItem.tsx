import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { useMotionPreference } from "./useMotionPreference";
import { mobileMotion } from "../theme/tokens";

/**
 * Staggered entrance for rows in a list.
 *
 * The stagger is capped at `stagger.maxItems`, so a 200-row list doesn't ripple
 * for eight seconds; everything past the cap enters together with the last
 * staggered row.
 */
export function AnimatedListItem({
  index,
  children,
  style,
}: {
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { enabled, d } = useMotionPreference();

  if (!enabled) {
    return <View style={style}>{children}</View>;
  }

  const delay = Math.min(index, mobileMotion.stagger.maxItems) * mobileMotion.stagger.list;

  return (
    <Animated.View
      entering={FadeInDown.duration(d(mobileMotion.duration.base)).delay(d(delay))}
      exiting={FadeOut.duration(d(mobileMotion.duration.fast))}
      layout={LinearTransition.duration(d(mobileMotion.duration.base))}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

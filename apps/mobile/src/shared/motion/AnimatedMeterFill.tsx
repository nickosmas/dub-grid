import { useEffect, useMemo } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DATA_REVEAL_MS } from "./useAnimatedCount";
import { useMotionPreference } from "./useMotionPreference";

export function clampMeterPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * A meter's fill, `percent` wide. It grows in from empty when it first shows
 * and glides between values after that, decelerating into place; under
 * reduce-motion it is drawn at its value.
 */
export function AnimatedMeterFill({
  percent,
  style,
}: {
  percent: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { enabled, timing } = useMotionPreference();
  const target = clampMeterPercent(percent);
  const width = useSharedValue(enabled ? 0 : target);
  const config = useMemo(() => timing("emphasizedDecelerate", DATA_REVEAL_MS), [timing]);

  useEffect(() => {
    width.value = withTiming(target, config);
  }, [config, target, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return <Animated.View style={[style, animatedStyle]} />;
}

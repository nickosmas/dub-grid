import { useEffect, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileRadius, mobileSpace } from "../theme/tokens";

const TRACK_WIDTH = mobileSpace["5xl"] * 3;
const TRACK_HEIGHT = mobileSpace.xs;
const BAR_WIDTH_RATIO = 0.4;
const SWEEP_MS = 1_200;

/**
 * The moving half of a startup surface.
 *
 * The brand mark beside this one is static by contract, so something else has
 * to say the app is working. An indeterminate bar is the honest shape for it:
 * startup has no measurable percentage to report, and a fake one that stalls at
 * 90% is worse than no number at all.
 *
 * Under reduced motion it holds a still, part-filled track rather than
 * disappearing. The indicator is the only thing on screen distinguishing
 * "loading" from "stuck", so it has to survive the setting that removes its
 * animation.
 */
export function StartupProgress({
  accessibilityLabel = "Loading",
}: {
  accessibilityLabel?: string;
}) {
  const mobileColors = useMobileColors();
  const { enabled } = useMotionPreference();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      offset.value = 0;
      return;
    }

    offset.value = 0;
    offset.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [enabled, offset]);

  const travel = useMemo(() => TRACK_WIDTH * (1 - BAR_WIDTH_RATIO), []);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value * travel }],
  }));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ text: accessibilityLabel }}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: mobileRadius.sm,
        backgroundColor: mobileColors.borderSubtle,
        overflow: "hidden",
      }}
      testID="startup-progress"
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH * BAR_WIDTH_RATIO,
            height: TRACK_HEIGHT,
            borderRadius: mobileRadius.sm,
            backgroundColor: mobileColors.brand,
          },
          enabled ? animatedStyle : null,
        ]}
        testID="startup-progress-bar"
      />
    </View>
  );
}

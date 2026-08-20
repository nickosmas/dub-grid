import { useCallback, useMemo } from "react";
import { Platform, type PressableAndroidRippleConfig } from "react-native";
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { hapticImpact, hapticSelection } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileMotion } from "../theme/tokens";

export type PressHaptic = "selection" | "light" | "medium" | "none";

/**
 * The app's single press affordance.
 *
 * The two platforms want opposite things, which is why this exists rather than
 * a shared `pressed && { opacity: 0.7 }` sprinkled across every screen:
 *
 *  - **iOS** has no built-in press state, so the control has to shrink. A
 *    spring (not a timing) is what makes it feel like a physical button.
 *  - **Android** already answers a touch with a ripple, and that ripple *is*
 *    Material's state layer. Scaling on top of it reads as a rendering bug, so
 *    Android gets no scale at all.
 *
 * Built on `Pressable` rather than `Gesture.Tap` deliberately: gestures would
 * register on every button in the tree, and the sheet tests select the most
 * recently created pan gesture.
 */
export function usePressAnimation(options?: {
  /** Pressed-state scale on iOS. Defaults to the shared press token. */
  scale?: number;
  /** Set false for disabled controls, so they neither animate nor buzz. */
  enabled?: boolean;
  rippleColor?: string;
  rippleBorderless?: boolean;
  haptic?: PressHaptic;
}): {
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  pressHandlers: { onPressIn: () => void; onPressOut: () => void };
  androidRipple: PressableAndroidRippleConfig | undefined;
} {
  const {
    scale = mobileMotion.press.scale,
    enabled = true,
    rippleColor,
    rippleBorderless = false,
    haptic = "selection",
  } = options ?? {};

  const mobileColors = useMobileColors();
  const reducedMotion = useReducedMotion();
  const isAndroid = Platform.OS === "android";

  // 1 at rest. Doubles as the opacity driver under reduced motion, where a
  // scale is exactly the kind of movement the setting asks us to drop.
  const progress = useSharedValue(1);

  const fireHaptic = useCallback(() => {
    if (!enabled) return;
    if (haptic === "none") return;
    if (haptic === "selection") {
      hapticSelection();
      return;
    }
    hapticImpact(haptic);
  }, [enabled, haptic]);

  const onPressIn = useCallback(() => {
    if (!enabled || isAndroid) {
      // The haptic still fires on Android; only the scale is skipped.
      fireHaptic();
      return;
    }
    // On press-in, not on press, so the buzz lands with the visual rather than
    // after the finger lifts.
    fireHaptic();
    progress.value = reducedMotion
      ? withTiming(mobileMotion.press.opacity, { duration: mobileMotion.duration.instant })
      : withSpring(scale, mobileMotion.spring.press);
  }, [enabled, fireHaptic, isAndroid, progress, reducedMotion, scale]);

  const onPressOut = useCallback(() => {
    if (!enabled || isAndroid) return;
    progress.value = reducedMotion
      ? withTiming(1, { duration: mobileMotion.duration.instant })
      : withSpring(1, mobileMotion.spring.press);
  }, [enabled, isAndroid, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    if (isAndroid) return {};
    if (reducedMotion) return { opacity: progress.value };
    return { transform: [{ scale: progress.value }] };
  }, [isAndroid, reducedMotion]);

  const androidRipple = useMemo(
    () =>
      isAndroid && enabled
        ? { color: rippleColor ?? mobileColors.rippleNeutral, borderless: rippleBorderless }
        : undefined,
    [enabled, isAndroid, mobileColors.rippleNeutral, rippleBorderless, rippleColor],
  );

  const pressHandlers = useMemo(() => ({ onPressIn, onPressOut }), [onPressIn, onPressOut]);

  return { animatedStyle, pressHandlers, androidRipple };
}

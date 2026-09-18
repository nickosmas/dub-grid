import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect, useMemo } from "react";
import {
  ANIMATED_LOGO_OPACITY_MAX,
  ANIMATED_LOGO_OPACITY_MIN,
  BRAND_ANIMATED_LOGO_SIZE,
  generateAnimatedLogoTimings,
} from "@dubgrid/design-tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

/** The pinwheel's recessive diagonal, matching the static `DubGridLogo`. */
const RECESSIVE_CELL_OPACITY = 0.3;

/**
 * Mobile twin of the web AnimatedDubGridLogo: the four-cell pinwheel with each
 * cell pulsing on its own random [duration, delay], generated at mount.
 *
 * Startup surfaces do not use this. They show the static `DubGridLogo` and put
 * their motion in `StartupProgress`, so this is left for any route-level
 * loading state that wants the mark itself to breathe.
 *
 * Under reduced motion it falls back to the static mark's own tones.
 */
export function AnimatedDubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const mobileColors = useMobileColors();
  const resolvedColor = color ?? mobileColors.brand;
  const reducedMotion = useReducedMotion();
  const timings = useMemo(() => generateAnimatedLogoTimings(), []);
  const gap = size * 0.045;
  const cell = (size - gap) / 2;
  const radius = cell * 0.2;
  const offset = cell + gap;
  const cells = [
    { x: 0, y: 0, restOpacity: RECESSIVE_CELL_OPACITY },
    { x: offset, y: 0, restOpacity: 1 },
    { x: 0, y: offset, restOpacity: 1 },
    { x: offset, y: offset, restOpacity: RECESSIVE_CELL_OPACITY },
  ];

  return (
    <View
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {cells.map((rect, index) => {
        const [duration, delay] = timings[index];
        const style = {
          position: "absolute" as const,
          left: rect.x,
          top: rect.y,
          width: cell,
          height: cell,
          borderRadius: radius,
          backgroundColor: resolvedColor,
        };

        if (reducedMotion) {
          return (
            <View key={`${rect.x}-${rect.y}`} style={[style, { opacity: rect.restOpacity }]} />
          );
        }

        return (
          <PulseCell
            key={`${rect.x}-${rect.y}`}
            style={style}
            durationMs={duration * 1000}
            delayMs={delay * 1000}
          />
        );
      })}
    </View>
  );
}

function PulseCell({
  style,
  durationMs,
  delayMs,
}: {
  style: object;
  durationMs: number;
  delayMs: number;
}) {
  const opacity = useSharedValue(ANIMATED_LOGO_OPACITY_MIN);

  useEffect(() => {
    const half = durationMs / 2;
    const ease = Easing.inOut(Easing.ease);
    opacity.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(ANIMATED_LOGO_OPACITY_MAX, { duration: half, easing: ease }),
          withTiming(ANIMATED_LOGO_OPACITY_MIN, { duration: half, easing: ease }),
        ),
        -1,
        false,
      ),
    );
  }, [delayMs, durationMs, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[style, animatedStyle]} />;
}

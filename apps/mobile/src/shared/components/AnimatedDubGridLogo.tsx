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
import { mobileColors } from "../theme/tokens";

const ROWS = [0, 1, 2, 3] as const;
const COLS = [0, 1, 2, 3] as const;

/**
 * Mobile twin of the web AnimatedDubGridLogo. Cells render as native
 * <View>s with backgroundColor + borderRadius (visually identical to
 * the SVG <rect>s on web at this size — no react-native-svg dependency).
 * Each cell's opacity is driven by a Reanimated shared value running on
 * the UI thread with random [duration, delay] generated at mount, so the
 * splash looks fresh every time.
 *
 * When the OS reports reduced-motion preference, falls back to a static
 * render mirroring the web `DubGridLogo` brand mark.
 */
export function AnimatedDubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color = mobileColors.brand,
}: {
  size?: number;
  color?: string;
}) {
  const reducedMotion = useReducedMotion();
  const timings = useMemo(() => generateAnimatedLogoTimings(), []);
  const cell = size / 4;
  const gap = cell * 0.1;
  const inner = cell - gap * 2;
  const radius = cell * 0.2;

  return (
    <View
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {ROWS.map((row) =>
        COLS.map((col) => {
          const index = row * 4 + col;
          const [duration, delay] = timings[index];
          const style = {
            position: "absolute" as const,
            left: col * cell + gap,
            top: row * cell + gap,
            width: inner,
            height: inner,
            borderRadius: radius,
            backgroundColor: color,
          };

          if (reducedMotion) {
            return (
              <View key={`${row}-${col}`} style={[style, { opacity: staticOpacity(row, col) }]} />
            );
          }

          return (
            <PulseCell
              key={`${row}-${col}`}
              style={style}
              durationMs={duration * 1000}
              delayMs={delay * 1000}
            />
          );
        }),
      )}
    </View>
  );
}

function staticOpacity(row: number, col: number) {
  if (row === 0 || col === 0) return 1;
  if (row + col <= 4) return 0.75;
  return 0.3;
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

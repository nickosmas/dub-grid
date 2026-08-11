import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { useMotionPreference } from "../../../shared/motion/useMotionPreference";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, mobileText, type MobileColors } from "../../../shared/theme/tokens";

/**
 * How far each layer drifts, as a fraction of the page width. The visual moves
 * further than the copy, which is what reads as depth: nearer things travel
 * faster than distant ones.
 */
const VISUAL_DRIFT = 0.3;
const COPY_DRIFT = 0.12;
const VISUAL_MIN_SCALE = 0.9;

export function OnboardingCard({
  visual,
  title,
  body,
  width,
  index,
  scrollX,
}: {
  visual: ReactNode;
  title: string;
  body: string;
  width: number;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { enabled: motionEnabled } = useMotionPreference();

  // The slide's own offset range: one page either side of where it sits.
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  const visualStyle = useAnimatedStyle(() => {
    if (!motionEnabled) return {};
    return {
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            range,
            [-width * VISUAL_DRIFT, 0, width * VISUAL_DRIFT],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            scrollX.value,
            range,
            [VISUAL_MIN_SCALE, 1, VISUAL_MIN_SCALE],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  }, [motionEnabled, width, index]);

  const copyStyle = useAnimatedStyle(() => {
    if (!motionEnabled) return {};
    return {
      opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(
            scrollX.value,
            range,
            [-width * COPY_DRIFT, 0, width * COPY_DRIFT],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  }, [motionEnabled, width, index]);

  return (
    <View style={[styles.page, { width }]}>
      <View style={styles.content}>
        <Animated.View style={[styles.visualFrame, visualStyle]}>{visual}</Animated.View>
        <Animated.View style={[styles.copy, copyStyle]}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.body}>{body}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      flex: 1,
      paddingHorizontal: mobileSpace["2xl"],
      paddingTop: mobileSpace["2xl"],
      alignItems: "center",
      justifyContent: "flex-start",
      // The visual drifts by a third of a page, which is far more slack than
      // its own margins have — without this, a neighbouring slide's mock-up
      // hangs over the one being read. The copy fades to zero across the same
      // range, so only the visual layer ever spills. Clipping to the page turns
      // that drift into what it is meant to be: parallax inside a window.
      overflow: "hidden",
    },
    content: {
      alignItems: "center",
      gap: mobileSpace.lg,
      maxWidth: 360,
      width: "100%",
    },
    // Stretches so the mock-up inside can bleed out to the app's own screen
    // gutter; an auto-width frame would shrink-wrap it back to the copy's
    // measure. The copy below keeps the slide's wider padding.
    visualFrame: {
      alignSelf: "stretch",
      marginBottom: mobileSpace.xs,
    },
    copy: {
      alignItems: "center",
      gap: mobileSpace.md,
      width: "100%",
    },
    title: {
      ...mobileText.heroMetric,
      color: mobileColors.textPrimary,
      fontSize: 26,
      lineHeight: 32,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },
  });

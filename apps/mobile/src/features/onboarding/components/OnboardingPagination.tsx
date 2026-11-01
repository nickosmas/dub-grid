import { StyleSheet, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";

// UIPageControl's geometry: round dots of one size, the current one at full
// strength and the rest faded, in the label colour rather than a tint.
const DOT_SIZE = 8;
const DOT_GAP = 9;
const IDLE_DOT_OPACITY = 0.3;

export function OnboardingPagination({
  count,
  pageWidth,
  scrollX,
}: {
  count: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
}) {
  return (
    <View accessible accessibilityRole="tablist" style={styles.row}>
      {Array.from({ length: count }, (_, index) => (
        <Dot key={index} index={index} pageWidth={pageWidth} scrollX={scrollX} />
      ))}
    </View>
  );
}

function Dot({
  index,
  pageWidth,
  scrollX,
}: {
  index: number;
  pageWidth: number;
  scrollX: SharedValue<number>;
}) {
  const mobileColors = useMobileColors();
  const animatedStyle = useAnimatedStyle(() => {
    const progress = pageWidth > 0 ? scrollX.value / pageWidth : 0;
    const distance = Math.abs(progress - index);
    const proximity = Math.min(distance, 1);

    return { opacity: interpolate(proximity, [0, 1], [1, IDLE_DOT_OPACITY]) };
  }, [index, pageWidth]);

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: mobileColors.textPrimary }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: DOT_GAP,
  },
  dot: {
    height: DOT_SIZE,
    width: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});

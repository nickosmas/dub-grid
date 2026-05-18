import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { mobileColors } from "../../../shared/theme/tokens";

const DOT_SIZE = 8;
const DOT_GAP = 8;
const ACTIVE_DOT_WIDTH = 24;

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
    <View
      accessible
      accessibilityRole="tablist"
      style={styles.row}
    >
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
  const animatedStyle = useAnimatedStyle(() => {
    const progress = pageWidth > 0 ? scrollX.value / pageWidth : 0;
    const distance = Math.abs(progress - index);
    const proximity = Math.min(distance, 1);

    const width = interpolate(
      proximity,
      [0, 1],
      [ACTIVE_DOT_WIDTH, DOT_SIZE],
    );
    const backgroundColor = interpolateColor(
      proximity,
      [0, 1],
      [mobileColors.brand, mobileColors.borderSubtle],
    );

    return { width, backgroundColor };
  }, [index, pageWidth]);

  return <Animated.View style={[styles.dot, animatedStyle]} />;
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

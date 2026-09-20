import { useMemo } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useMotionPreference } from "../../../shared/motion/useMotionPreference";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileMotion, type MobileColors } from "../../../shared/theme/tokens";

/**
 * The dashboard's period is changing: the previous period's cards stay where
 * they are under the sheet scrim, with one spinner in the middle of the screen
 * until the next period lands. Rendered through `Screen`'s overlay slot so it
 * covers the sticky header and never scrolls with the cards.
 */
export function PeriodLoadingOverlay() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { d } = useMotionPreference();

  return (
    <Animated.View
      accessibilityLabel="Loading period"
      accessible
      entering={FadeIn.duration(d(mobileMotion.duration.fast))}
      exiting={FadeOut.duration(d(mobileMotion.duration.fast))}
      style={styles.scrim}
      testID="period-loading"
    >
      <ActivityIndicator color={mobileColors.textInverse} size="large" />
    </Animated.View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.overlay,
    },
  });

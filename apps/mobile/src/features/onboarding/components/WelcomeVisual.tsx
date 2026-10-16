import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { BrandSymbol } from "../../../shared/components/BrandMark";
import { useMotionPreference } from "../../../shared/motion/useMotionPreference";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileMotion, type MobileColors } from "../../../shared/theme/tokens";

const SYMBOL_HEIGHT = 96;
const HALO_SIZE = 200;
// Held back until the startup splash has faded, so the arrival is seen.
const ENTRANCE_DELAY_MS = 120;

/**
 * The welcome step's visual: the symbol on a soft brand halo. It settles in
 * once on first show and is static from then on, the way the logo is static
 * wherever it identifies the product.
 */
export function WelcomeVisual() {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { enabled: motionEnabled, timing } = useMotionPreference();
  const progress = useSharedValue(motionEnabled ? 0 : 1);
  const config = useMemo(
    () => timing("emphasizedDecelerate", mobileMotion.duration.slower),
    [timing],
  );

  useEffect(() => {
    progress.value = withDelay(ENTRANCE_DELAY_MS, withTiming(1, config));
  }, [config, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + 0.08 * progress.value }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.stage}
    >
      <Animated.View style={[styles.halo, animatedStyle]}>
        <BrandSymbol height={SYMBOL_HEIGHT} />
      </Animated.View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    stage: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    halo: {
      width: HALO_SIZE,
      height: HALO_SIZE,
      borderRadius: HALO_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.brandSoft,
    },
  });

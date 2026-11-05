import { Image, StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  darkColorTokens,
  lightColorTokens,
} from "@dubgrid/design-tokens";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileMotion } from "../theme/tokens";

const SPLASH_ICON = require("../../../assets/images/splash-icon.png");
const SPLASH_ICON_DARK = require("../../../assets/images/splash-icon-dark.png");

/**
 * The native launch image, held still: the same mark at the same size on the
 * same background (`expo-splash-screen` in app.json), so launch, the app
 * lock's cover and the wait for startup read as one frame, as the system's
 * own apps do (owner, 2026-11-04: no logo animation on the way in).
 */
export function AppSplashScreen(_props?: { body?: string }) {
  const isDark = useIsDarkMode();
  const { d } = useMotionPreference();

  return (
    // Fades out on unmount so the handoff to the app is a short cross-dissolve
    // rather than a hard cut.
    <Animated.View
      exiting={FadeOut.duration(d(mobileMotion.duration.base))}
      style={[
        styles.root,
        { backgroundColor: isDark ? darkColorTokens.background : lightColorTokens.surface },
      ]}
    >
      <View style={styles.center}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="DubGrid"
          accessibilityRole="image"
          source={isDark ? SPLASH_ICON_DARK : SPLASH_ICON}
          style={styles.mark}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Whole screen, not the safe area, as the launch image is.
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: BRAND_ANIMATED_LOGO_SIZE,
    height: BRAND_ANIMATED_LOGO_SIZE,
  },
});

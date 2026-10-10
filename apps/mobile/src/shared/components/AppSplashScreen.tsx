import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_MARK_INK,
  BRAND_MARK_SQUARE,
  BRAND_STACKED_SYMBOL_EM,
  getBrandStackedLayout,
} from "@dubgrid/design-tokens";
import { type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileMotion } from "../theme/tokens";
import { AnimatedDubGridLogo } from "./AnimatedDubGridLogo";
import { DubGridWordmark } from "./DubGridWordmark";
import { GradientBackdrop } from "./GradientBackdrop";

// Room for the wordmark to overhang the mark on both sides without widening
// the centered box.
const WORDMARK_OVERHANG = 120;

// The stacked lockup, built around the launch image's mark: the wordmark is
// sized so the symbol's ink is `BRAND_STACKED_SYMBOL_EM` of it, then placed
// below the ink and nudged so the two optical centers line up.
const MARK_SCALE = BRAND_ANIMATED_LOGO_SIZE / BRAND_MARK_SQUARE.size;
const WORDMARK_SIZE = (BRAND_MARK_INK.width * MARK_SCALE) / BRAND_STACKED_SYMBOL_EM;
const STACKED = getBrandStackedLayout(WORDMARK_SIZE);
const INK_BOTTOM = (BRAND_MARK_INK.y + BRAND_MARK_INK.height - BRAND_MARK_SQUARE.y) * MARK_SCALE;
const INK_CENTER_X =
  (BRAND_MARK_INK.x + BRAND_MARK_INK.width / 2 - BRAND_MARK_SQUARE.x) * MARK_SCALE;
const WORDMARK_SHIFT_X = INK_CENTER_X - STACKED.symbolOffsetX - BRAND_ANIMATED_LOGO_SIZE / 2;

/**
 * Picks up exactly where the native launch image leaves off. That image is
 * the static mark, `BRAND_ANIMATED_LOGO_SIZE` wide and centered on the whole
 * screen (see `expo-splash-screen` in app.json), so the mark here sits at the
 * same spot and everything else arrives around it: the wash and wordmark fade
 * in, and the wordmark takes its stacked-lockup place below the mark. The launch reads
 * as one splash coming alive rather than two splashes in a row.
 */
export function AppSplashScreen(_props?: { body?: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { d } = useMotionPreference();

  return (
    // Fades out on unmount so the handoff to login or onboarding is a
    // cross-dissolve rather than a hard cut.
    <Animated.View exiting={FadeOut.duration(d(mobileMotion.duration.base))} style={styles.root}>
      <Animated.View
        entering={FadeIn.duration(d(mobileMotion.duration.slow))}
        style={StyleSheet.absoluteFill}
      >
        <GradientBackdrop height="100%" kind="brandWash" />
      </Animated.View>
      <View style={styles.center}>
        <View style={styles.mark}>
          <AnimatedDubGridLogo />
          <Animated.View
            entering={FadeIn.duration(d(mobileMotion.duration.slow)).delay(d(200))}
            style={styles.wordmark}
          >
            <DubGridWordmark color={mobileColors.textPrimary} fontSize={WORDMARK_SIZE} />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    // Whole screen, not the safe area: the launch image ignores insets, and a
    // centered box that also held the wordmark would push the mark up.
    center: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    mark: {
      width: BRAND_ANIMATED_LOGO_SIZE,
      height: BRAND_ANIMATED_LOGO_SIZE,
    },
    wordmark: {
      position: "absolute",
      top: INK_BOTTOM + STACKED.gap,
      left: -WORDMARK_OVERHANG,
      right: -WORDMARK_OVERHANG,
      alignItems: "center",
      transform: [{ translateX: WORDMARK_SHIFT_X }],
    },
  });

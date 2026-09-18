import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileMotion, mobileSpace } from "../theme/tokens";
import { AnimatedDubGridLogo } from "./AnimatedDubGridLogo";
import { DubGridWordmark } from "./DubGridWordmark";
import { GradientBackdrop } from "./GradientBackdrop";

export function AppSplashScreen(_props?: { body?: string }) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { d } = useMotionPreference();

  return (
    // Fades out on unmount so the handoff to login or onboarding is a
    // cross-dissolve rather than a hard cut.
    <Animated.View exiting={FadeOut.duration(d(mobileMotion.duration.base))} style={styles.root}>
      <GradientBackdrop height="100%" kind="brandWash" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <AnimatedDubGridLogo />
          <Animated.View entering={FadeIn.duration(d(mobileMotion.duration.slow)).delay(d(200))}>
            <DubGridWordmark color={mobileColors.textPrimary} fontSize={24} />
          </Animated.View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: mobileColors.background,
    },
    safeArea: {
      flex: 1,
    },
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: mobileSpace.xl,
    },
  });

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useMotionPreference } from "../motion/useMotionPreference";
import { mobileMotion, mobileSpace } from "../theme/tokens";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { AnimatedDubGridLogo } from "./AnimatedDubGridLogo";
import { DubGridWordmark } from "./DubGridWordmark";
import { GradientBackdrop } from "./GradientBackdrop";
import { StartupProgress } from "./StartupProgress";

/**
 * What the splash is allowed to say, and when.
 *
 * `quiet` is every normal launch: mark, wordmark, progress. Copy appears only
 * once a wait is long enough to be worth explaining, and the escape only once
 * it is long enough to be worth escaping.
 */
export type StartupPhase = "quiet" | "status" | "timeout";

export function AppSplashScreen({
  phase = "quiet",
  offline = false,
  onRetry,
  retrying = false,
}: {
  phase?: StartupPhase;
  offline?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const { d } = useMotionPreference();

  const message = offline
    ? "You are offline. We will pick up as soon as you are connected."
    : phase === "timeout"
      ? "This is taking longer than it should."
      : "Still getting things ready.";

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
          <StartupProgress />
          {phase === "quiet" ? null : (
            <Animated.View
              entering={FadeIn.duration(d(mobileMotion.duration.base))}
              style={styles.message}
            >
              <AppText align="center" tone="muted" variant="body">
                {message}
              </AppText>
              {phase === "timeout" && onRetry ? (
                <Button
                  label="Try again"
                  loading={retrying}
                  onPress={onRetry}
                  size="md"
                  tone="secondary"
                />
              ) : null}
            </Animated.View>
          )}
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
    message: {
      alignItems: "center",
      gap: mobileSpace.lg,
      paddingHorizontal: mobileSpace["3xl"],
    },
  });

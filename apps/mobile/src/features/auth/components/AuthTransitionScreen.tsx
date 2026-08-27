import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../../shared/components/Button";
import { useOptionalNetworkStatus } from "../../../shared/providers/NetworkStateProvider";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobileSpace, mobileText, type MobileColors } from "../../../shared/theme/tokens";

type TransitionPhase = "signing-in" | "organization" | "onboarding";

const COPY: Record<TransitionPhase, { title: string; detail: string }> = {
  "signing-in": { title: "Signing you in", detail: "We’re securely starting your session." },
  organization: {
    title: "Preparing your Organization",
    detail: "We’re loading the information you need to get started.",
  },
  onboarding: { title: "Loading your setup", detail: "We’re checking what needs to happen next." },
};

/** The post-splash equivalent of the native launch screen: always informative, never blank. */
export function AuthTransitionScreen({
  phase,
  onRetry,
  onSignOut,
  retrying = false,
  automaticallyRetry = false,
}: {
  phase: TransitionPhase;
  onRetry?: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  retrying?: boolean;
  automaticallyRetry?: boolean;
}) {
  const colors = useMobileColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isOffline } = useOptionalNetworkStatus();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [automaticRetryCount, setAutomaticRetryCount] = useState(0);
  const automaticRetryInFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const copy = COPY[phase];
  const isSlow = elapsedSeconds >= 15;
  const showEscape = elapsedSeconds >= 30;

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!automaticallyRetry || !onRetry || isOffline || retrying) return;
    const cappedDelay = Math.min(5_000 * 2 ** automaticRetryCount, 30_000);
    const delay = Math.round(cappedDelay * (0.5 + Math.random() * 0.5));
    const timer = setTimeout(() => {
      if (automaticRetryInFlight.current) return;
      automaticRetryInFlight.current = true;
      Promise.resolve()
        .then(onRetry)
        .catch(() => undefined)
        .finally(() => {
          automaticRetryInFlight.current = false;
          if (mounted.current) {
            setAutomaticRetryCount((count) => count + 1);
          }
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [automaticallyRetry, automaticRetryCount, isOffline, onRetry, retrying]);

  const detail = isOffline
    ? "You appear to be offline. We’ll continue when your connection returns."
    : isSlow
      ? "This is taking longer than usual. We’re still working in the background."
      : copy.detail;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        {...(Platform.OS === "android" ? { accessibilityLiveRegion: "polite" as const } : {})}
        accessibilityRole="progressbar"
        style={styles.content}
      >
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.detail}>{detail}</Text>
        {showEscape ? (
          <View style={styles.actions}>
            {onRetry ? <Button label="Try again" loading={retrying} onPress={onRetry} /> : null}
            <Button label="Sign out" onPress={onSignOut} tone="secondary" />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: MobileColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    content: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: mobileSpace["3xl"],
      gap: mobileSpace.xl,
    },
    title: { ...mobileText.screenTitle, color: colors.textPrimary, textAlign: "center" },
    detail: {
      ...mobileText.body,
      color: colors.textMuted,
      textAlign: "center",
      maxWidth: 360,
      lineHeight: 24,
    },
    actions: { width: "100%", maxWidth: 360, gap: mobileSpace.md, marginTop: mobileSpace.lg },
  });

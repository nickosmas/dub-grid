import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import LoginScreen from "../src/features/auth/screens/LoginScreen";
import { AppSplashScreen } from "../src/shared/components/AppSplashScreen";
import { loadHasSeenOnboarding } from "../src/shared/lib/session";
import { useSessionState } from "../src/shared/providers/AuthSessionProvider";

const MIN_SPLASH_MS = 900;

export default function IndexScreen() {
  const { accessToken, isLoading } = useSessionState();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const hasNavigatedRef = useRef(false);
  const hasHiddenNativeSplashRef = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumElapsed(true);
    }, MIN_SPLASH_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (hasHiddenNativeSplashRef.current) {
      return;
    }

    hasHiddenNativeSplashRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;

    void loadHasSeenOnboarding().then((seen) => {
      if (!active) return;
      setNeedsOnboarding(!seen);
      setOnboardingChecked(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !minimumElapsed || !onboardingChecked || hasNavigatedRef.current) {
      return;
    }

    if (accessToken) {
      hasNavigatedRef.current = true;
      router.replace("/(tabs)/home");
      return;
    }

    if (needsOnboarding) {
      hasNavigatedRef.current = true;
      router.replace("/(auth)/onboarding");
    }
  }, [accessToken, isLoading, minimumElapsed, needsOnboarding, onboardingChecked]);

  if (isLoading || !minimumElapsed || !onboardingChecked || accessToken || needsOnboarding) {
    return <AppSplashScreen />;
  }

  return <LoginScreen />;
}

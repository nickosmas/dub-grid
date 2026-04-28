import { useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import LoginScreen from "../src/features/auth/screens/LoginScreen";
import { AppSplashScreen } from "../src/shared/components/AppSplashScreen";
import { useSessionState } from "../src/shared/providers/AuthSessionProvider";

const MIN_SPLASH_MS = 900;

export default function IndexScreen() {
  const { accessToken, isLoading } = useSessionState();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const hasNavigatedRef = useRef(false);
  const splashBody = useMemo(() => {
    if (isLoading) {
      return "Restoring your mobile session and loading the next screen.";
    }

    if (accessToken) {
      return "Opening your schedule, requests, and team tools.";
    }

    return "Preparing the sign-in screen for your mobile workspace.";
  }, [accessToken, isLoading]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumElapsed(true);
    }, MIN_SPLASH_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (isLoading || !minimumElapsed || !accessToken || hasNavigatedRef.current) {
      return;
    }

    hasNavigatedRef.current = true;
    router.replace("/(tabs)/me");
  }, [accessToken, isLoading, minimumElapsed]);

  if (isLoading || !minimumElapsed || accessToken) {
    return <AppSplashScreen body={splashBody} />;
  }

  return <LoginScreen />;
}

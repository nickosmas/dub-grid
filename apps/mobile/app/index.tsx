import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useHasSeenOnboarding } from "../src/features/auth/hooks/useHasSeenOnboarding";
import LoginScreen from "../src/features/auth/screens/LoginScreen";
import { useSessionState } from "../src/shared/providers/AuthSessionProvider";

/**
 * The launch route. It only picks a destination — `StartupSplashGate` in the
 * root layout owns the splash and covers this screen until the pick is made,
 * so nothing here renders one. Rendering a second splash from a route is what
 * made launch look like the splash played twice.
 */
export default function IndexScreen() {
  const { accessToken, isLoading, restoreError } = useSessionState();
  const onboardingQuery = useHasSeenOnboarding();
  const needsOnboarding = onboardingQuery.data === false;
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (isLoading || restoreError || onboardingQuery.isLoading || hasNavigatedRef.current) {
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
  }, [accessToken, isLoading, needsOnboarding, onboardingQuery.isLoading, restoreError]);

  // Nothing to paint until the destination is known: the splash is on top, and
  // rendering the login screen early would flash it at a signed-in or first-run
  // user the moment the splash lifts.
  if (isLoading || onboardingQuery.isLoading || accessToken || (needsOnboarding && !restoreError)) {
    return null;
  }

  return <LoginScreen />;
}

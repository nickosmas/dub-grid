import { useEffect, useRef } from "react";
import { router, useNavigation } from "expo-router";
import { useHasSeenOnboarding } from "../src/features/auth/hooks/useHasSeenOnboarding";
import { useSignInHandoffPending } from "../src/features/auth/lib/sign-in-handoff";
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
  const navigation = useNavigation();
  const hasNavigatedRef = useRef(false);
  const signInHandoffPending = useSignInHandoffPending();

  useEffect(() => {
    if (isLoading || restoreError || onboardingQuery.isLoading || hasNavigatedRef.current) {
      return;
    }
    // A protected route may have put the login screen on top of this one
    // with its own way back; that screen owns the hop after sign-in.
    if (!navigation.isFocused()) return;

    if (accessToken) {
      // A sign-in from the form below navigates once its bootstrap is warm.
      if (signInHandoffPending) return;
      hasNavigatedRef.current = true;
      router.replace("/(tabs)/home");
      return;
    }

    if (needsOnboarding) {
      hasNavigatedRef.current = true;
      router.replace("/(auth)/onboarding");
    }
  }, [
    accessToken,
    isLoading,
    navigation,
    needsOnboarding,
    onboardingQuery.isLoading,
    restoreError,
    signInHandoffPending,
  ]);

  // The same form instance, still showing its pending button, until the
  // sign-in it is running replaces this route. Painting nothing here left a
  // blank page behind the navigation.
  if (accessToken && signInHandoffPending) {
    return <LoginScreen />;
  }

  // Nothing to paint until the destination is known: the splash is on top, and
  // rendering the login screen early would flash it at a signed-in or first-run
  // user the moment the splash lifts.
  if (isLoading || onboardingQuery.isLoading || accessToken || (needsOnboarding && !restoreError)) {
    return null;
  }

  return <LoginScreen />;
}

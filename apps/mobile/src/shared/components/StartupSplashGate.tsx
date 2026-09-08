import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useBootstrap } from "../../features/auth/hooks/useBootstrap";
import { authEntryRecorder } from "../../features/auth/lib/auth-entry-measurement";
import { useHasSeenOnboarding } from "../../features/auth/hooks/useHasSeenOnboarding";
import { useSessionState } from "../providers/AuthSessionProvider";
import { AppSplashScreen } from "./AppSplashScreen";

/**
 * Long enough for the logo to read as a deliberate brand moment rather than a
 * flicker, short enough that it is usually over before startup resolves.
 */
const MIN_SPLASH_MS = 900;

/**
 * The app's one and only splash.
 *
 * It lives above the router and holds a single `<AppSplashScreen />` instance
 * from launch until the first screen the user can actually act on is ready.
 * Screens must never render their own: two instances in sequence read as the
 * splash showing twice, because the second one restarts the wordmark fade from
 * zero and re-randomizes the logo cell timings. The router renders *underneath*
 * this overlay rather than being replaced by it, so the index route can resolve
 * its destination and hand off while the splash still covers the seam.
 *
 * The completion latch is one-way. Nothing that happens later in the session —
 * a bootstrap refetch, a realtime invalidation, a sign-in on a fresh token —
 * can bring the splash back.
 */
export function StartupSplashGate({ children }: PropsWithChildren) {
  const { accessToken, isLoading: isSessionLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const onboardingQuery = useHasSeenOnboarding();
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  // Owned here, not by a route: the native splash has to come down on every
  // launch, including deep links that mount a screen without passing through
  // the index route. `preventAutoHideAsync` in the root layout holds it open
  // forever otherwise, and the app looks frozen on its launch image.
  const hasHiddenNativeSplashRef = useRef(false);
  useEffect(() => {
    if (hasHiddenNativeSplashRef.current) {
      return;
    }

    hasHiddenNativeSplashRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumElapsed(true);
    }, MIN_SPLASH_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Bootstrap is part of startup, not part of the tab tree: the tab bar's
  // shape and the Home tab's choice of screen both depend on it, so releasing
  // before it lands pops tabs in and paints the wrong skeleton. Waiting here
  // means the tab tree mounts with it already cached.
  //
  // `isLoading` is false while the query is disabled (signed out) and false
  // again the moment it settles either way, so a bootstrap failure still lifts
  // the splash and lets the tab gate show its locked state.
  const isStartupResolved =
    minimumElapsed &&
    !isSessionLoading &&
    !onboardingQuery.isLoading &&
    !(Boolean(accessToken) && bootstrapQuery.isLoading);

  // Latched during render rather than synced in an effect: an effect would
  // leave the splash up for one extra frame after the app is ready, and this
  // assignment is monotonic, so a double render can't undo it.
  const hasCompletedRef = useRef(false);
  if (isStartupResolved) {
    hasCompletedRef.current = true;
  }

  useEffect(() => {
    if (isStartupResolved) {
      authEntryRecorder.markStartupGateReady();
    }
  }, [isStartupResolved]);

  return (
    <View style={styles.root}>
      {children}
      {hasCompletedRef.current ? null : (
        <View style={styles.overlay}>
          <AppSplashScreen />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    // Both, deliberately: iOS orders siblings by tree position and honours
    // zIndex, Android reorders them by elevation and ignores zIndex once any
    // sibling has one. The splash root paints an opaque background, which
    // Android elevation requires.
    zIndex: 24,
    elevation: 24,
  },
});

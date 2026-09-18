import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  STARTUP_MIN_SPLASH_MS,
  STARTUP_STATUS_DELAY_MS,
  STARTUP_TIMEOUT_MS,
} from "@dubgrid/design-tokens";
import { useBootstrap } from "../../features/auth/hooks/useBootstrap";
import { authEntryRecorder } from "../../features/auth/lib/auth-entry-measurement";
import { useHasSeenOnboarding } from "../../features/auth/hooks/useHasSeenOnboarding";
import { useSessionState } from "../providers/AuthSessionProvider";
import { useOptionalNetworkStatus } from "../providers/NetworkStateProvider";
import { AppSplashScreen, type StartupPhase } from "./AppSplashScreen";

/**
 * Last-resort release. The timeout phase hands the user a Retry well before
 * this, but a bootstrap that never settles must not own the launch forever:
 * releasing lets the tab gate render its own locked state instead.
 */
const MAX_BOOTSTRAP_SPLASH_MS = 15_000;

/**
 * The app's one and only splash.
 *
 * It lives above the router and holds a single `<AppSplashScreen />` instance
 * from launch until the first screen the user can actually act on is ready.
 * Screens must never render their own: two instances in sequence read as the
 * splash showing twice. The router renders *underneath* this overlay rather
 * than being replaced by it, so the index route can resolve its destination and
 * hand off while the splash still covers the seam.
 *
 * The completion latch is one-way. Nothing that happens later in the session,
 * a bootstrap refetch, a realtime invalidation, a sign-in on a fresh token,
 * can bring the splash back.
 *
 * The splash carries a static mark, so it holds only long enough to avoid a
 * flicker (`STARTUP_MIN_SPLASH_MS`) rather than long enough to play an
 * animation. What keeps a slow launch legible is the progress indicator, the
 * status copy at `STARTUP_STATUS_DELAY_MS`, and the Retry at
 * `STARTUP_TIMEOUT_MS`, not time spent on the brand.
 */
export function StartupSplashGate({ children }: PropsWithChildren) {
  const { accessToken, isLoading: isSessionLoading } = useSessionState();
  const bootstrapQuery = useBootstrap(accessToken);
  const onboardingQuery = useHasSeenOnboarding();
  const { isOffline } = useOptionalNetworkStatus();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [bootstrapBudgetElapsed, setBootstrapBudgetElapsed] = useState(false);
  const [phase, setPhase] = useState<StartupPhase>("quiet");
  const [retrying, setRetrying] = useState(false);

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
      setBootstrapBudgetElapsed(true);
    }, MAX_BOOTSTRAP_SPLASH_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinimumElapsed(true);
    }, STARTUP_MIN_SPLASH_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  // Silence, then an explanation, then a way out. A launch that resolves before
  // the first of these never shows copy at all, which is the common case.
  useEffect(() => {
    const toStatus = setTimeout(() => {
      setPhase((current) => (current === "quiet" ? "status" : current));
    }, STARTUP_STATUS_DELAY_MS);
    const toTimeout = setTimeout(() => {
      setPhase("timeout");
    }, STARTUP_TIMEOUT_MS);

    return () => {
      clearTimeout(toStatus);
      clearTimeout(toTimeout);
    };
  }, []);

  const handleRetry = useCallback(() => {
    setRetrying(true);
    void Promise.resolve(bootstrapQuery.refetch?.()).finally(() => {
      setRetrying(false);
    });
  }, [bootstrapQuery]);

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
    !(
      Boolean(accessToken) &&
      bootstrapQuery.isLoading &&
      bootstrapQuery.fetchStatus !== "paused" &&
      !bootstrapBudgetElapsed
    );

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
          <AppSplashScreen
            offline={isOffline}
            onRetry={handleRetry}
            phase={phase}
            retrying={retrying}
          />
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

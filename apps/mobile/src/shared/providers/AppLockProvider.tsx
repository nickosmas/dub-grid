import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, StyleSheet, View } from "react-native";
import { AppLockSurface } from "../components/AppLockSurface";
import { AppSplashScreen } from "../components/AppSplashScreen";
import {
  appLockRequired,
  appLockUnsupported,
  getAppLockEnabledSnapshot,
  getAppLockStateSnapshot,
  isSettingsDeviceCheckOpen,
  setAppLockSurface,
  loadAppLockEnabled,
  subscribeAppLockEnabled,
  type AppLockState,
} from "../lib/app-lock";
import { getUserIdFromAccessToken } from "../lib/access-token";
import { handleExpiredMobileSession } from "../lib/auth-reset";
import { useSessionState } from "./AuthSessionProvider";

/**
 * The app-lock setting, live.
 *
 * Exported so the security screen's switch reads the same external store the
 * lock itself runs on, instead of mirroring the stored value into local state
 * in an effect where the two can drift apart.
 */
export function useAppLockEnabled(): boolean {
  useEffect(() => {
    void loadAppLockEnabled();
  }, []);

  return useSyncExternalStore(subscribeAppLockEnabled, getAppLockEnabledSnapshot, () => false);
}

/** The lock's stored state, loading it on first use. */
export function useAppLockState(): AppLockState {
  useEffect(() => {
    void loadAppLockEnabled();
  }, []);

  return useSyncExternalStore(subscribeAppLockEnabled, getAppLockStateSnapshot, () => "loading");
}

/**
 * Opt-in device lock: arms when the app leaves the foreground and requires a
 * biometric/passcode check (via expo-local-authentication) on return, plus on
 * cold start if the setting is on. Fails open (never locks the user out) when
 * the device has no biometrics/passcode enrolled — the OS-level auth is the
 * enforcement point, this is just a gate in front of it.
 */
export function AppLockProvider({ children }: PropsWithChildren) {
  const { accessToken } = useSessionState();
  const lockState = useAppLockState();
  const required = appLockRequired(lockState);
  // Keyed on the account rather than the token: the token rotates on refresh,
  // which can land while the system prompt is up, and a passed check must
  // still unlock.
  const lockIdentity = getUserIdFromAccessToken(accessToken) ?? accessToken;
  // The account the person last unlocked. The lock is derived from it during
  // render rather than set in an effect, which left one frame of content
  // showing between the setting loading and the lock taking hold (41b3).
  // Another account signing in, or leaving the foreground, clears it.
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null);
  // While the setting is known to be off, the person in the app counts as
  // unlocked, so turning the lock on does not lock them out on the spot; it
  // first applies when the app next leaves. Only a known "disabled" counts:
  // "loading" must stay locked (F-17).
  if (lockState === "disabled" && lockIdentity && unlockedFor !== lockIdentity) {
    setUnlockedFor(lockIdentity);
  }
  const [authenticating, setAuthenticating] = useState(false);
  // The automatic check did not pass: the lock turns from the splash into a
  // page that says so, with a retry and a way to sign out.
  const [failed, setFailed] = useState(false);
  // iOS reports `inactive` in the app switcher, and takes the switcher's
  // snapshot soon after: content is covered then without locking, which the
  // system prompt's own `inactive` must not do.
  const [obscured, setObscured] = useState(false);
  // The system prompt can only be raised in the foreground. Raising it as the
  // app went to the background failed at once and left the lock waiting for a
  // tap on its return.
  const [appActive, setAppActive] = useState(() => AppState.currentState !== "background");
  // Whether this lock has already raised the system prompt on its own. Without
  // it, cancelling Face ID put the effect below straight back into
  // `attemptUnlock` (the lock was still showing and `authenticating` had just
  // gone false), so the prompt reappeared the instant it was dismissed,
  // forever. Going to the background resets it, so every return prompts once.
  const hasPromptedRef = useRef(false);

  const attemptUnlock = useCallback(async () => {
    setAuthenticating(true);
    setFailed(false);
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        // Device can't satisfy the lock, so don't strand the user behind it.
        setUnlockedFor(lockIdentity);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock the app",
      });
      if (result.success) {
        setUnlockedFor(lockIdentity);
      } else {
        setFailed(true);
      }
    } catch {
      // `authenticateAsync` rejects rather than resolving `{ success: false }`
      // when the activity isn't ready for it, which on Android can happen as
      // the app resumes. Try again is the retry.
      setFailed(true);
    } finally {
      setAuthenticating(false);
    }
  }, [lockIdentity]);

  // Keyed on having a session, not on the token: a token that rotates while
  // the app switcher is open would otherwise re-run the cleanup below and drop
  // the cover until `background` (F-42).
  const hasSession = Boolean(accessToken);

  // Lock whenever the app leaves the foreground.
  useEffect(() => {
    if (appLockUnsupported || !hasSession || !required) return;

    // Only leaving for the background arms the lock. iOS also reports
    // `inactive` while the system Face ID prompt is up, so treating that as
    // leaving relocked the app the moment the check passed (41d1).
    // Nothing heard the app's state while this was unsubscribed.
    setAppActive(AppState.currentState !== "background");
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      setObscured(state === "background" || (state === "inactive" && !isSettingsDeviceCheckOpen()));
      if (state === "background") {
        setUnlockedFor(null);
        setFailed(false);
        hasPromptedRef.current = false;
      }
    });

    return () => {
      subscription.remove();
      // Nothing hears the return to `active` once unsubscribed (a sign-out
      // while the app was covered), so the cover must not outlive it.
      setObscured(false);
    };
  }, [hasSession, required]);

  const showLock =
    !appLockUnsupported && Boolean(lockIdentity) && required && unlockedFor !== lockIdentity;

  // Raise the system prompt once per lock, as soon as the app is in front.
  // Every retry after that is the user pressing Try again, which is what keeps
  // a declined check from becoming a loop.
  useEffect(() => {
    if (!showLock) {
      hasPromptedRef.current = false;
      setFailed(false);
      return;
    }

    if (hasPromptedRef.current || !appActive) return;

    hasPromptedRef.current = true;
    void attemptUnlock();
  }, [showLock, appActive, attemptUnlock]);

  // Before paint, so an open sheet never shows its content above the lock.
  useLayoutEffect(() => {
    setAppLockSurface(
      showLock
        ? {
            engaged: true,
            failed,
            retrying: authenticating,
            retry: () => void attemptUnlock(),
            signOut: () => void handleExpiredMobileSession(),
          }
        : null,
    );
  }, [showLock, failed, authenticating, attemptUnlock]);
  useLayoutEffect(() => () => setAppLockSurface(null), []);

  const hydrating = !appLockUnsupported && Boolean(accessToken) && lockState === "loading";

  return (
    <>
      {children}
      {hydrating || showLock || (obscured && required && Boolean(accessToken)) ? (
        <View style={StyleSheet.absoluteFill} testID="app-lock-cover">
          {showLock ? (
            <View style={StyleSheet.absoluteFill} testID="app-lock">
              <AppLockSurface
                failed={failed}
                retrying={authenticating}
                onRetry={() => void attemptUnlock()}
                onSignOut={() => void handleExpiredMobileSession()}
              />
            </View>
          ) : (
            <AppSplashScreen />
          )}
        </View>
      ) : null}
    </>
  );
}

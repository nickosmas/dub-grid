import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, StyleSheet, View } from "react-native";
import {
  BottomSheetModal,
  SheetActions,
  SheetCopy,
  SheetHeader,
} from "../components/BottomSheetModal";
import { AppSplashScreen } from "../components/AppSplashScreen";
import { Button } from "../components/Button";
import {
  appLockRequired,
  appLockUnsupported,
  getAppLockEnabledSnapshot,
  getAppLockStateSnapshot,
  loadAppLockEnabled,
  subscribeAppLockEnabled,
  type AppLockState,
} from "../lib/app-lock";
import { getUserIdFromAccessToken } from "../lib/access-token";
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
  const [authenticating, setAuthenticating] = useState(false);
  // iOS reports `inactive` in the app switcher, and takes the switcher's
  // snapshot soon after: content is covered then without locking, which the
  // system prompt's own `inactive` must not do.
  const [obscured, setObscured] = useState(false);
  // Whether this lock has already raised the system prompt on its own. Without
  // it, cancelling Face ID put the effect below straight back into
  // `attemptUnlock` (the lock was still showing and `authenticating` had just
  // gone false), so the prompt reappeared the instant it was dismissed,
  // forever, with the sheet's own Unlock button unreachable underneath it.
  const hasPromptedRef = useRef(false);

  const attemptUnlock = useCallback(async () => {
    setAuthenticating(true);
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
      }
    } catch {
      // `authenticateAsync` rejects rather than resolving `{ success: false }`
      // when the activity isn't ready for it, which on Android happens exactly
      // when this runs: as the app resumes. Leave the sheet up; the Unlock
      // button is the retry.
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
    const subscription = AppState.addEventListener("change", (state) => {
      setObscured(state !== "active");
      if (state === "background") {
        setUnlockedFor(null);
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

  // Raise the system prompt once per lock. Every retry after that is the user
  // pressing Unlock, which is what keeps a declined check from becoming a loop.
  useEffect(() => {
    if (!showLock) {
      hasPromptedRef.current = false;
      return;
    }

    if (hasPromptedRef.current) return;

    hasPromptedRef.current = true;
    void attemptUnlock();
  }, [showLock, attemptUnlock]);
  const hydrating = !appLockUnsupported && Boolean(accessToken) && lockState === "loading";

  return (
    <>
      {children}
      {/* Stays up under the lock too: the lock is a native modal that fades
          in, and content must not show through while it does. */}
      {hydrating || showLock || (obscured && required && Boolean(accessToken)) ? (
        <View style={StyleSheet.absoluteFill} testID="app-lock-cover">
          <AppSplashScreen />
        </View>
      ) : null}
      {/* `backdrop="cover"` is load-bearing, not cosmetic: the lock exists to
          keep the app's content off the screen, so the usual translucent scrim
          would defeat it. `dismissDisabled` is what makes the sheet blocking —
          the only way past it is the device check. */}
      <BottomSheetModal
        presentationKind="gate"
        accessibilityRole="alert"
        backdrop="cover"
        dismissDisabled
        footer={
          <SheetActions>
            <Button label="Unlock" loading={authenticating} onPress={() => attemptUnlock()} />
          </SheetActions>
        }
        header={<SheetHeader icon="lock-closed-outline" title="App locked" />}
        visible={showLock}
        onDismiss={() => {}}
      >
        <SheetCopy body="Verify it's you to continue." />
      </BottomSheetModal>
    </>
  );
}

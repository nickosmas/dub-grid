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
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  // Whether this lock has already raised the system prompt on its own. Without
  // it, cancelling Face ID put the effect below straight back into
  // `attemptUnlock` — `locked` was still true and `authenticating` had just
  // gone false — so the prompt reappeared the instant it was dismissed, forever,
  // with the sheet's own Unlock button unreachable underneath it.
  const hasPromptedRef = useRef(false);

  const attemptUnlock = useCallback(async () => {
    setAuthenticating(true);
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        // Device can't satisfy the lock — don't strand the user behind it.
        setLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock the app",
      });
      if (result.success) {
        setLocked(false);
      }
    } catch {
      // `authenticateAsync` rejects rather than resolving `{ success: false }`
      // when the activity isn't ready for it, which on Android happens exactly
      // when this runs: as the app resumes. Leave the sheet up; the Unlock
      // button is the retry.
    } finally {
      setAuthenticating(false);
    }
  }, []);

  // Lock on cold start, and on a new session, once the setting is known to
  // require it. Until then the cover below keeps the app off the screen.
  useEffect(() => {
    if (appLockUnsupported || !accessToken || !required) return;
    setLocked(true);
  }, [accessToken, required]);

  // Lock whenever the app leaves the foreground.
  useEffect(() => {
    if (appLockUnsupported || !accessToken || !required) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setLocked(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, required]);

  // Raise the system prompt once per lock. Every retry after that is the user
  // pressing Unlock, which is what keeps a declined check from becoming a loop.
  useEffect(() => {
    if (!locked) {
      hasPromptedRef.current = false;
      return;
    }

    if (hasPromptedRef.current) return;

    hasPromptedRef.current = true;
    void attemptUnlock();
  }, [locked, attemptUnlock]);

  const showLock = !appLockUnsupported && Boolean(accessToken) && required && locked;
  const hydrating = !appLockUnsupported && Boolean(accessToken) && lockState === "loading";

  return (
    <>
      {children}
      {hydrating ? (
        <View style={StyleSheet.absoluteFill} testID="app-lock-hydrating">
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

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState } from "react-native";
import {
  BottomSheetModal,
  SheetActions,
  SheetCopy,
  SheetHeader,
} from "../components/BottomSheetModal";
import { Button } from "../components/Button";
import {
  appLockUnsupported,
  getAppLockEnabledSnapshot,
  loadAppLockEnabled,
  subscribeAppLockEnabled,
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

/**
 * Opt-in device lock: arms when the app leaves the foreground and requires a
 * biometric/passcode check (via expo-local-authentication) on return, plus on
 * cold start if the setting is on. Fails open (never locks the user out) when
 * the device has no biometrics/passcode enrolled — the OS-level auth is the
 * enforcement point, this is just a gate in front of it.
 */
export function AppLockProvider({ children }: PropsWithChildren) {
  const { accessToken } = useSessionState();
  const enabled = useAppLockEnabled();
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);

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
        promptMessage: "Unlock DubGrid",
      });
      if (result.success) {
        setLocked(false);
      }
    } finally {
      setAuthenticating(false);
    }
  }, []);

  // Lock on cold start when the setting is already on.
  useEffect(() => {
    if (appLockUnsupported || !accessToken) return;
    let active = true;
    void loadAppLockEnabled().then((value) => {
      if (active && value) setLocked(true);
    });
    return () => {
      active = false;
    };
  }, [accessToken]);

  // Lock whenever the app leaves the foreground.
  useEffect(() => {
    if (appLockUnsupported || !accessToken || !enabled) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setLocked(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [accessToken, enabled]);

  useEffect(() => {
    if (locked && !authenticating) {
      void attemptUnlock();
    }
  }, [locked, authenticating, attemptUnlock]);

  const showLock = !appLockUnsupported && Boolean(accessToken) && enabled && locked;

  return (
    <>
      {children}
      {/* `backdrop="cover"` is load-bearing, not cosmetic: the lock exists to
          keep the app's content off the screen, so the usual translucent scrim
          would defeat it. `dismissDisabled` is what makes the sheet blocking —
          the only way past it is the device check. */}
      <BottomSheetModal
        accessibilityRole="alert"
        backdrop="cover"
        dismissDisabled
        header={<SheetHeader icon="lock-closed-outline" title="DubGrid is locked" />}
        visible={showLock}
        onDismiss={() => {}}
      >
        <SheetCopy body="Verify it's you to continue." />
        <SheetActions>
          <Button label="Unlock" loading={authenticating} onPress={() => void attemptUnlock()} />
        </SheetActions>
      </BottomSheetModal>
    </>
  );
}

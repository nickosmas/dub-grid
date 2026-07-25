import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, Modal, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button } from "../components/Button";
import {
  appLockUnsupported,
  getAppLockEnabledSnapshot,
  loadAppLockEnabled,
  subscribeAppLockEnabled,
} from "../lib/app-lock";
import { mobileText, type MobileColors } from "../theme/tokens";
import { useSessionState } from "./AuthSessionProvider";
import { useMobileColors } from "./ThemeModeProvider";

function useAppLockEnabled(): boolean {
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
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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
      <Modal
        animationType="fade"
        onRequestClose={() => {}}
        presentationStyle="overFullScreen"
        transparent
        visible={showLock}
      >
        <View style={styles.root}>
          <View accessibilityRole="alert" style={styles.card}>
            <Ionicons color={mobileColors.brand} name="lock-closed-outline" size={32} />
            <Text style={styles.title}>DubGrid is locked</Text>
            <Text style={styles.body}>Verify it's you to continue.</Text>
            <Button
              disabled={authenticating}
              label={authenticating ? "Verifying…" : "Unlock"}
              onPress={() => void attemptUnlock()}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: mobileColors.surface,
    },
    card: {
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 32,
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textSecondary,
      textAlign: "center",
    },
  });

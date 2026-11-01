import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useAppLockSurface } from "../lib/app-lock";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../theme/tokens";
import { AppSplashScreen } from "./AppSplashScreen";
import { ContentUnavailable } from "./ContentUnavailable";

interface AppLockSurfaceProps {
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}

/** The splash while the device check runs, and the locked page if it fails. */
export function AppLockSurface({ failed, ...page }: AppLockSurfaceProps) {
  return failed ? <AppLockedPage {...page} /> : <AppSplashScreen />;
}

/** The lock, drawn inside a sheet's or confirmation's own window. */
export function AppLockOverlay() {
  const lock = useAppLockSurface();
  if (!lock.engaged) return null;

  return (
    <View style={StyleSheet.absoluteFill} testID="app-lock-overlay">
      <AppLockSurface
        failed={lock.failed}
        retrying={lock.retrying}
        onRetry={lock.retry}
        onSignOut={lock.signOut}
      />
    </View>
  );
}

function AppLockedPage({ retrying, onRetry, onSignOut }: Omit<AppLockSurfaceProps, "failed">) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <View accessibilityRole="alert" style={styles.page}>
      <ContentUnavailable
        body="Verify it's you to continue, or sign out."
        iconName="lock-closed-outline"
        primaryAction={{ label: "Unlock", loading: retrying, onPress: onRetry }}
        secondaryAction={{ label: "Sign out", disabled: retrying, onPress: onSignOut }}
        title="The app is locked"
      />
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      alignItems: "center",
      backgroundColor: mobileColors.background,
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: mobileSpace["3xl"],
    },
  });

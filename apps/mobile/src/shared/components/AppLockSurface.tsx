import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppLockSurface } from "../lib/app-lock";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileSpace, type MobileColors } from "../theme/tokens";
import { AppSplashScreen } from "./AppSplashScreen";
import { Button } from "./Button";
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
  const insets = useSafeAreaInsets();

  // The message in the middle, the two ways out stacked full width at the
  // foot, in thumb reach: Unlock first, Sign out the quiet one under it.
  return (
    <View accessibilityRole="alert" style={styles.page}>
      <View style={styles.message}>
        <ContentUnavailable
          body="Verify it's you to continue, or sign out."
          iconName="lock-closed-outline"
          title="The app is locked"
        />
      </View>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, mobileSpace.lg) }]}>
        <Button fullWidth label="Unlock" loading={retrying} onPress={onRetry} size="lg" />
        <Button
          disabled={retrying}
          fullWidth
          label="Sign out"
          onPress={onSignOut}
          size="lg"
          tone="neutral"
        />
      </View>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      backgroundColor: mobileColors.background,
      flex: 1,
      paddingHorizontal: mobileSpace["2xl"],
    },
    message: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    actions: {
      gap: mobileSpace.md,
    },
  });

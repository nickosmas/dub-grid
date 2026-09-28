import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { useAppLockSurface } from "../lib/app-lock";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { ActionButtons } from "./ActionButtons";
import { AppSplashScreen } from "./AppSplashScreen";
import { Button } from "./Button";
import { Text } from "./Text";

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
      <View style={styles.iconFrame}>
        <Ionicons color={mobileColors.brand} name="lock-closed-outline" size={28} />
      </View>
      <Text style={styles.title}>DubGrid is locked</Text>
      <Text style={styles.body}>Verify it's you to continue, or sign out.</Text>
      <ActionButtons
        primaryAction={
          <Button label="Try again" loading={retrying} onPress={onRetry} tone="primary" />
        }
        style={styles.actions}
      >
        <Button disabled={retrying} label="Sign out" onPress={onSignOut} tone="neutral" />
      </ActionButtons>
    </View>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    page: {
      alignItems: "center",
      backgroundColor: mobileColors.background,
      flex: 1,
      gap: mobileSpace.md,
      justifyContent: "center",
      paddingHorizontal: mobileSpace["3xl"],
    },
    iconFrame: {
      alignItems: "center",
      backgroundColor: mobileColors.brandSoft,
      borderRadius: mobileRadii.pill,
      height: 56,
      justifyContent: "center",
      width: 56,
    },
    title: {
      ...mobileText.sectionTitle,
      color: mobileColors.textPrimary,
      textAlign: "center",
    },
    body: {
      ...mobileText.body,
      color: mobileColors.textSubtle,
      textAlign: "center",
    },
    actions: {
      marginTop: mobileSpace.sm,
    },
  });

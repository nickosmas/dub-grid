import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { createIconControlStyle } from "../components/icon-control-style";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { type MobileColors } from "../theme/tokens";

/**
 * The back control on an iOS pushed screen, drawn by JS instead of UIKit.
 *
 * react-native-screens 4.16 (Expo SDK 54's pin) has an open iOS 26 defect
 * (software-mansion/react-native-screens#3294): once a screen has been pushed
 * above a `headerShown: false` screen, popped and pushed again, the native
 * back button stops responding until the app is killed, while the edge swipe
 * and every other bar item keep working. Every pushed screen here sits above
 * `(tabs)`, which hides its header, so Alerts, Shift Detail and the Profile
 * pages all went deaf on device. A `headerLeft` item is an ordinary bar
 * button and is not affected. Remove with the react-native-screens bump that
 * comes with the next Expo SDK.
 *
 * Wears the app's own round icon chrome (the Home week chevrons, the bell),
 * so the bar reads as one set of controls. The fallback covers a stack that
 * has nothing behind it, such as a cold start straight into Alerts from a
 * push notification.
 */
export function HeaderBackButton() {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);

  return (
    <Pressable
      accessibilityLabel="Back"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/home");
        }
      }}
      style={styles.button}
    >
      <Ionicons color={mobileColors.textPrimary} name="chevron-back" size={22} />
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    button: {
      ...createIconControlStyle(mobileColors, isDark),
    },
  });

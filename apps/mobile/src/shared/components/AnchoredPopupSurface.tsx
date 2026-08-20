import { useMemo, type PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { mobileElevation, mobileRadii, type MobileColors } from "../theme/tokens";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";

export function AnchoredPopupSurface({
  children,
  style,
  accessibilityLabel,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const styles = useMemo(() => createStyles(mobileColors, isDark), [mobileColors, isDark]);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      onStartShouldSetResponder={() => true}
      style={[styles.surface, style]}
    >
      {children}
    </View>
  );
}

const createStyles = (mobileColors: MobileColors, isDark: boolean) =>
  StyleSheet.create({
    surface: {
      position: "absolute",
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: isDark ? 1 : 0,
      borderColor: mobileColors.borderSubtle,
      ...mobileElevation("float", isDark),
    },
  });

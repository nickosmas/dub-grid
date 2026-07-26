import { useMemo, type PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { mobileRadii, type MobileColors } from "../theme/tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

export function AnchoredPopupSurface({
  children,
  style,
  accessibilityLabel,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    surface: {
      position: "absolute",
      backgroundColor: mobileColors.surface,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      borderColor: mobileColors.borderSubtle,
      shadowColor: mobileColors.shadowStrong,
      shadowOffset: {
        width: 0,
        height: 10,
      },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 6,
    },
  });

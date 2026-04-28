import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { mobileColors, mobileRadii } from "../theme/tokens";

export function AnchoredPopupSurface({
  children,
  style,
  accessibilityLabel,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
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

const styles = StyleSheet.create({
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

import { StyleSheet } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileTextWeighted } from "../theme/tokens";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type ChromeTextButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * A worded button in a screen's own header, beside its icon buttons and the
 * same height. Android draws Material 3's filled tonal button; iOS has its
 * own version in Liquid Glass (`ChromeTextButton.ios.tsx`).
 */
export function ChromeTextButton({ label, onPress, accessibilityLabel }: ChromeTextButtonProps) {
  const mobileColors = useMobileColors();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      android_ripple={{ color: mobileColors.rippleNeutral, borderless: false }}
      hitSlop={10}
      onPress={onPress}
      style={[styles.button, { backgroundColor: mobileColors.controlSecondaryBg }]}
    >
      <Text fit="compact" numberOfLines={1} style={[styles.label, { color: mobileColors.brand }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: ICON_CONTROL_SIZE,
    paddingHorizontal: mobileSpace.lg,
    borderRadius: mobileRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    ...mobileTextWeighted("body", "semibold"),
  },
});

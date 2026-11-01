import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii } from "../theme/tokens";
import { ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";

export type ChromeIconButtonProps = {
  accessibilityLabel: string;
  onPress: () => void;
  /** The glyph. */
  children: ReactNode;
  /** Drawn over the button's top-right edge, such as an unread count. */
  badge?: ReactNode;
  /** Kept on screen but inert, such as Close while a request is in flight. */
  disabled?: boolean;
};

/**
 * A round icon button in a screen's own header. Android draws Material 3's
 * filled tonal icon button with its ripple; iOS has its own version in Liquid
 * Glass (`ChromeIconButton.ios.tsx`).
 */
export function ChromeIconButton({
  accessibilityLabel,
  onPress,
  children,
  badge,
  disabled = false,
}: ChromeIconButtonProps) {
  const mobileColors = useMobileColors();

  return (
    <View style={styles.frame}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={disabled ? { disabled } : undefined}
        disabled={disabled}
        android_ripple={{ color: mobileColors.rippleNeutral, borderless: false }}
        hitSlop={10}
        onPress={onPress}
        style={[styles.button, { backgroundColor: mobileColors.controlSecondaryBg }]}
      >
        {children}
      </Pressable>
      {badge}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
  },
  button: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    borderRadius: mobileRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

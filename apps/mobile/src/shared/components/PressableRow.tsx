import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { hapticSelection } from "../lib/haptics";
import { useMobileColors } from "../providers/ThemeModeProvider";
import type { MobileColors } from "../theme/tokens";

/**
 * A pressable list row.
 *
 * Deliberately *not* `usePressAnimation`: that scales the target, which is
 * right for a button but wrong for a full-width row, where a scale reads as the
 * whole list flinching. Rows use the platform's own row idiom instead, a
 * background highlight on iOS and a ripple on Android.
 *
 * Replaces four hand-rolled treatments that had drifted to `opacity: 0.62`,
 * `0.64`, and a background swap. Fading a row also fades its text, which is the
 * one thing a press should never do.
 */
export function PressableRow({
  children,
  accessibilityLabel,
  accessibilityRole = "button",
  selected,
  disabled = false,
  haptic = true,
  style,
  onPress,
}: {
  children: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  selected?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled, selected }}
      android_ripple={disabled ? undefined : { color: mobileColors.rippleNeutral }}
      disabled={disabled}
      onPress={() => {
        if (haptic) hapticSelection();
        onPress();
      }}
      style={({ pressed }) => [
        style,
        // Android draws its ripple over the row, so a highlight on top of it
        // would double up.
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    pressed: {
      backgroundColor: mobileColors.navActiveBg,
    },
    disabled: {
      opacity: 0.4,
    },
  });

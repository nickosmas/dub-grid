import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { hapticSelection } from "../lib/haptics";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileListRow, type MobileColors } from "../theme/tokens";

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
  onPress: () => void | Promise<unknown>;
}) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  // A row is as easy to double-tap as a button, and a row that navigates or
  // mutates on press should do it once. The row shows no spinner of its own,
  // so only the latch matters here; `isRunning` keeps it unpressable until the
  // work settles.
  const action = useAsyncAction(() => {
    if (haptic) hapticSelection();
    return onPress();
  });
  const isDisabled = disabled || action.isRunning;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: isDisabled, busy: action.isRunning, selected }}
      android_ripple={isDisabled ? undefined : { color: mobileColors.rippleNeutral }}
      disabled={isDisabled}
      onPress={action.run}
      style={({ pressed }) => [
        styles.row,
        style,
        // Android draws its ripple over the row, so a highlight on top of it
        // would double up.
        pressed && !isDisabled && styles.pressed,
        // Only an explicitly disabled row dims. A row briefly busy from its own
        // press must not flicker to 40% opacity mid-tap.
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    // A row is a target in its own right, so it is never shorter than one.
    // Callers add their own padding on top; this is only the floor.
    row: {
      minHeight: mobileListRow.minHeight,
    },
    pressed: {
      backgroundColor: mobileColors.navActiveBg,
    },
    disabled: {
      opacity: 0.4,
    },
  });

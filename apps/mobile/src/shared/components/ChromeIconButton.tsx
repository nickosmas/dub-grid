import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
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

// Fixed for the app's run: the glass APIs are a property of the OS version.
const HAS_LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * A round icon button in a screen's own header: Liquid Glass where the OS
 * has it (iOS 26), otherwise a tonal circle with Android's ripple. Shape,
 * size and content are the same on both phones.
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
        android_ripple={
          HAS_LIQUID_GLASS ? undefined : { color: mobileColors.rippleNeutral, borderless: false }
        }
        hitSlop={10}
        onPress={onPress}
        style={
          HAS_LIQUID_GLASS
            ? styles.frame
            : [styles.circle, { backgroundColor: mobileColors.controlSecondaryBg }]
        }
      >
        {HAS_LIQUID_GLASS ? (
          <GlassView glassEffectStyle="regular" isInteractive style={styles.circle}>
            {children}
          </GlassView>
        ) : (
          children
        )}
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
  circle: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    borderRadius: mobileRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

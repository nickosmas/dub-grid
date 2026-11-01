import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii } from "../theme/tokens";
import { createIconControlStyle, ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";
import type { ChromeIconButtonProps } from "./ChromeIconButton";

export type { ChromeIconButtonProps } from "./ChromeIconButton";

// Fixed for the app's run: the glass APIs are a property of the OS version.
const HAS_LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * The header icon button in Liquid Glass, the material iOS 26 gives its own
 * bar buttons. Before iOS 26 it keeps the app's surface circle.
 */
export function ChromeIconButton({
  accessibilityLabel,
  onPress,
  children,
  badge,
  disabled = false,
}: ChromeIconButtonProps) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const fallbackStyle = useMemo(
    () => createIconControlStyle(mobileColors, isDark),
    [mobileColors, isDark],
  );

  return (
    <View style={styles.frame}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={disabled ? { disabled } : undefined}
        disabled={disabled}
        hitSlop={10}
        onPress={onPress}
        style={styles.frame}
      >
        {HAS_LIQUID_GLASS ? (
          <GlassView glassEffectStyle="regular" isInteractive style={styles.glass}>
            {children}
          </GlassView>
        ) : (
          <View style={fallbackStyle}>{children}</View>
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
  glass: {
    width: ICON_CONTROL_SIZE,
    height: ICON_CONTROL_SIZE,
    borderRadius: mobileRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});

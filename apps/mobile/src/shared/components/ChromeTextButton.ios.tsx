import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useIsDarkMode, useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileTextWeighted } from "../theme/tokens";
import { createIconControlStyle, ICON_CONTROL_SIZE } from "./icon-control-style";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import type { ChromeTextButtonProps } from "./ChromeTextButton";

export type { ChromeTextButtonProps } from "./ChromeTextButton";

// Fixed for the app's run: the glass APIs are a property of the OS version.
const HAS_LIQUID_GLASS = isLiquidGlassAvailable();

/**
 * The header's worded button in Liquid Glass, matching `ChromeIconButton`
 * beside it. Before iOS 26 it keeps the app's surface capsule.
 */
export function ChromeTextButton({ label, onPress, accessibilityLabel }: ChromeTextButtonProps) {
  const mobileColors = useMobileColors();
  const isDark = useIsDarkMode();
  const fallbackStyle = useMemo(
    () => [createIconControlStyle(mobileColors, isDark), styles.capsule],
    [mobileColors, isDark],
  );
  const text = (
    <Text fit="compact" numberOfLines={1} style={[styles.label, { color: mobileColors.brand }]}>
      {label}
    </Text>
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.glass}>
          {text}
        </GlassView>
      ) : (
        <View style={fallbackStyle}>{text}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glass: {
    height: ICON_CONTROL_SIZE,
    paddingHorizontal: mobileSpace.lg,
    borderRadius: mobileRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  capsule: {
    width: undefined,
    paddingHorizontal: mobileSpace.lg,
  },
  label: {
    ...mobileTextWeighted("body", "semibold"),
  },
});

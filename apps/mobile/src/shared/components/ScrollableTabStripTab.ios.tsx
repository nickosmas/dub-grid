import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileControl,
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileTextWeighted,
  type MobileColors,
} from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

export type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

const HAS_LIQUID_GLASS = isLiquidGlassAvailable();
// The count's circle takes the system fill gray; the capsule itself stays
// clear glass at rest (owner, 2026-10-31).
const COUNT_FILL = "rgba(120, 120, 128, 0.16)";

/**
 * A tab as an iOS 26 Liquid Glass capsule: clear glass at rest, tinted with
 * the brand colour while selected, and its count in a small gray circle (a
 * white one on the selected capsule). Before iOS 26 it keeps a
 * filled capsule.
 */
export function ScrollableTabStripTab({
  label,
  count,
  isActive,
  maxWidth,
  onLayout,
  onPress,
}: ScrollableTabStripTabProps) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);

  const content = (
    <>
      <Text fit="compact" style={[styles.label, isActive && styles.onTint]}>
        {label}
      </Text>
      {count ? (
        <View style={[styles.countPill, isActive && styles.countPillOnTint]}>
          <Text fit="compact" style={[styles.count, isActive && styles.countOnTint]}>
            {count}
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityValue={count ? { text: String(count) } : undefined}
      accessibilityState={{ selected: isActive }}
      hitSlop={{ bottom: 4, top: 4 }}
      onLayout={onLayout}
      onPress={onPress}
      style={{ maxWidth }}
    >
      {HAS_LIQUID_GLASS ? (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          style={styles.capsule}
          tintColor={isActive ? mobileColors.brand : undefined}
        >
          {content}
        </GlassView>
      ) : (
        <View style={[styles.capsule, isActive ? styles.fallbackActive : styles.fallbackIdle]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}

const COUNT_SIZE = 22;

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    capsule: {
      ...mobilePillOverflow.interactiveContainer,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: mobileControl.sm,
      paddingHorizontal: mobileSpace.lg,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadii.pill,
    },
    fallbackIdle: {
      backgroundColor: mobileColors.controlNeutralBg,
    },
    fallbackActive: {
      backgroundColor: mobileColors.brand,
    },
    label: {
      ...mobileTextWeighted("body", "semibold"),
      ...mobilePillOverflow.interactiveText,
      color: mobileColors.textPrimary,
    },
    onTint: {
      color: mobileColors.onBrandText,
    },
    countPill: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: COUNT_SIZE,
      height: COUNT_SIZE,
      borderRadius: COUNT_SIZE / 2,
      paddingHorizontal: mobileSpace.xs,
      backgroundColor: COUNT_FILL,
    },
    countPillOnTint: {
      backgroundColor: "rgba(255, 255, 255, 0.24)",
    },
    count: {
      ...mobileTextWeighted("caption", "bold"),
      color: mobileColors.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    countOnTint: {
      color: mobileColors.onBrandText,
    },
  });

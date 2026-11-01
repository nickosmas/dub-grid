import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobileControl,
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../theme/tokens";
import { NumericBadge } from "./NumericBadge";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

export type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

/**
 * One tab of `ScrollableTabStrip`, as the web build and the tests draw it.
 * The phones draw their own: Liquid Glass capsules on iOS
 * (`.ios.tsx`) and Material 3 filter chips on Android (`.android.tsx`).
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

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      // The badge is a sibling the explicit label hides from assistive tech;
      // the value slot reads the count right after the name.
      accessibilityValue={count ? { text: String(count) } : undefined}
      accessibilityState={{ selected: isActive }}
      hitSlop={{ bottom: 4, top: 4 }}
      onLayout={onLayout}
      onPress={onPress}
      style={[styles.tab, { maxWidth }, isActive && styles.tabActive]}
    >
      <Text fit="compact" style={[styles.label, isActive ? styles.labelActive : styles.labelIdle]}>
        {label}
      </Text>
      <NumericBadge count={count ?? 0} tone={isActive ? "onAccent" : "neutral"} />
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    tab: {
      ...mobilePillOverflow.interactiveContainer,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      minHeight: mobileControl.sm,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.sm,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      borderColor: mobileColors.controlNeutralBorder,
      backgroundColor: mobileColors.controlNeutralBg,
    },
    tabActive: {
      backgroundColor: mobileColors.brand,
      borderColor: mobileColors.brand,
    },
    label: {
      ...mobileText.bodyStrong,
      ...mobilePillOverflow.interactiveText,
    },
    labelIdle: {
      color: mobileColors.textSecondary,
    },
    labelActive: {
      color: mobileColors.onBrandText,
    },
  });

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  mobilePillOverflow,
  mobileSpace,
  mobileTextWeighted,
  type MobileColors,
} from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

export type { ScrollableTabStripTabProps } from "./ScrollableTabStripTab.types";

// Material 3 filter chip geometry.
const CHIP_HEIGHT = 32;
const CHIP_RADIUS = 8;
const COUNT_SIZE = 20;

/**
 * A tab as a Material 3 filter chip: outlined at rest, filled with the
 * brand's container colour and led by a check mark while selected, with the
 * count in a small blue-tinted circle after the label.
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
      accessibilityValue={count ? { text: String(count) } : undefined}
      accessibilityState={{ selected: isActive }}
      android_ripple={{ color: mobileColors.rippleNeutral }}
      hitSlop={{ bottom: 8, top: 8 }}
      onLayout={onLayout}
      onPress={onPress}
      style={[styles.chip, { maxWidth }, isActive ? styles.chipSelected : styles.chipIdle]}
    >
      {isActive ? <MaterialIcons color={mobileColors.brand} name="check" size={18} /> : null}
      <Text fit="compact" style={[styles.label, isActive && styles.labelSelected]}>
        {label}
      </Text>
      {count ? (
        <View style={styles.countPill}>
          <Text fit="compact" style={styles.count}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    chip: {
      ...mobilePillOverflow.interactiveContainer,
      flexDirection: "row",
      alignItems: "center",
      gap: mobileSpace.sm,
      height: CHIP_HEIGHT,
      borderRadius: CHIP_RADIUS,
      overflow: "hidden",
      paddingHorizontal: mobileSpace.lg,
    },
    chipIdle: {
      borderWidth: 1,
      borderColor: mobileColors.controlNeutralBorder,
    },
    chipSelected: {
      backgroundColor: mobileColors.brandSoft,
      paddingLeft: mobileSpace.sm,
    },
    label: {
      ...mobileTextWeighted("meta", "medium"),
      ...mobilePillOverflow.interactiveText,
      color: mobileColors.textSecondary,
    },
    labelSelected: {
      color: mobileColors.brand,
    },
    countPill: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: COUNT_SIZE,
      height: COUNT_SIZE,
      borderRadius: COUNT_SIZE / 2,
      paddingHorizontal: mobileSpace.xs,
      backgroundColor: mobileColors.controlSecondaryBg,
    },
    count: {
      ...mobileTextWeighted("caption", "bold"),
      color: mobileColors.controlSecondaryFg,
      fontVariant: ["tabular-nums"],
    },
  });

import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import {
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileText,
  type MobileColors,
} from "../../../shared/theme/tokens";

export type CountBadgeTone = "brand" | "warning" | "danger" | "success";

// Fill only, like `Chip`: a badge is a label, and a stroke around a soft fill
// read as an outline sticker next to the card's own edge. The fills already
// separate from both grounds (`contrast.test.ts` holds them there).
function createToneStyles(
  mobileColors: MobileColors,
): Record<CountBadgeTone, { backgroundColor: string; color: string }> {
  return {
    brand: {
      backgroundColor: mobileColors.brandSoft,
      color: mobileColors.brand,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      color: mobileColors.warningText,
    },
    danger: {
      backgroundColor: mobileColors.dangerSoft,
      color: mobileColors.dangerText,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      color: mobileColors.successText,
    },
  };
}

export function CountBadge({ label, tone = "brand" }: { label: string; tone?: CountBadgeTone }) {
  const mobileColors = useMobileColors();
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];

  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.backgroundColor }]}>
      <Text style={[styles.label, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...mobilePillOverflow.displayContainer,
    borderRadius: mobileRadii.pill,
    paddingHorizontal: mobileSpace.sm,
    paddingVertical: mobileSpace.xs,
    alignSelf: "flex-start",
  },
  label: {
    ...mobileText.badge,
    ...mobilePillOverflow.displayText,
  },
});

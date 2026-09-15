import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import { mobilePillOverflow, mobileText, type MobileColors } from "../../../shared/theme/tokens";

export type CountBadgeTone = "brand" | "warning" | "danger" | "success";

function createToneStyles(
  mobileColors: MobileColors,
): Record<CountBadgeTone, { backgroundColor: string; borderColor: string; color: string }> {
  return {
    brand: {
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      color: mobileColors.brand,
    },
    warning: {
      backgroundColor: mobileColors.warningSoft,
      borderColor: mobileColors.warningBorder,
      color: mobileColors.warningText,
    },
    danger: {
      backgroundColor: mobileColors.dangerSoft,
      borderColor: mobileColors.dangerBorder,
      color: mobileColors.dangerText,
    },
    success: {
      backgroundColor: mobileColors.successSoft,
      borderColor: mobileColors.successBorder,
      color: mobileColors.successText,
    },
  };
}

export function CountBadge({ label, tone = "brand" }: { label: string; tone?: CountBadgeTone }) {
  const mobileColors = useMobileColors();
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor },
      ]}
    >
      <Text style={[styles.label, { color: toneStyle.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    ...mobilePillOverflow.displayContainer,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: {
    ...mobileText.badge,
    ...mobilePillOverflow.displayText,
  },
});

import { StyleSheet, Text, View } from "react-native";
import { mobileColors, mobileText } from "../../../shared/theme/tokens";

export type CountBadgeTone = "brand" | "warning" | "danger" | "success";

const TONE_STYLES: Record<CountBadgeTone, { backgroundColor: string; borderColor: string; color: string }> = {
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

export function CountBadge({ label, tone = "brand" }: { label: string; tone?: CountBadgeTone }) {
  const toneStyle = TONE_STYLES[tone];

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
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: {
    ...mobileText.badge,
  },
});

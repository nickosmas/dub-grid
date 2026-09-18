import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { formatBadgeCount, numericBadgeSize, type NumericBadgeSize } from "@dubgrid/design-tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import {
  MAX_FONT_SCALE,
  MAX_FONT_SCALE_FIXED,
  mobileRadii,
  mobileTabularText,
  mobileText,
  type MobileColors,
} from "../theme/tokens";

export type NumericBadgeTone = "danger" | "brand" | "brandSoft" | "neutral" | "onAccent";

function createToneStyles(
  mobileColors: MobileColors,
): Record<NumericBadgeTone, { backgroundColor: string; color: string }> {
  return {
    danger: { backgroundColor: mobileColors.danger, color: mobileColors.textInverse },
    brand: { backgroundColor: mobileColors.brand, color: mobileColors.textInverse },
    brandSoft: { backgroundColor: mobileColors.brandSoft, color: mobileColors.brand },
    neutral: { backgroundColor: mobileColors.surface, color: mobileColors.textMuted },
    // Sits on a filled control (a selected segment, the brand filter button),
    // so it lightens that fill instead of picking a surface of its own.
    onAccent: { backgroundColor: "rgba(255, 255, 255, 0.22)", color: mobileColors.textInverse },
  };
}

/**
 * The one count badge: a fill-only pill whose minimum height and width come
 * from the shared size token, so a one-digit value only looks circular because
 * its content is narrower than the minimum, and large text can grow it.
 * Renders nothing for a count of zero.
 */
export function NumericBadge({
  count,
  max,
  size = "md",
  tone = "neutral",
  label,
  style,
}: {
  count: number;
  /** Counts above this show as `${max}+`. Bell badges pass 9. */
  max?: number;
  size?: NumericBadgeSize;
  tone?: NumericBadgeTone;
  /**
   * Accessible name for a badge floating on an icon ("26 unread alerts"). An
   * inline count inside a labeled control omits it and the control's own
   * accessible name carries the number.
   */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const mobileColors = useMobileColors();
  const toneStyle = useMemo(() => createToneStyles(mobileColors), [mobileColors])[tone];
  const text = formatBadgeCount(count, max);
  if (text === null) return null;

  const { size: box, paddingX } = numericBadgeSize[size];

  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.badge,
        { minHeight: box, minWidth: box, paddingHorizontal: paddingX },
        { backgroundColor: toneStyle.backgroundColor },
        style,
      ]}
    >
      <Text
        // A floating dot that outgrows its icon ring stops pointing at
        // anything, so it scales less than an inline count.
        maxFontSizeMultiplier={size === "sm" ? MAX_FONT_SCALE_FIXED : MAX_FONT_SCALE}
        style={[size === "sm" ? styles.textSm : styles.textMd, { color: toneStyle.color }]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: mobileRadii.pill,
    flexShrink: 0,
  },
  textMd: {
    ...mobileText.badge,
    ...mobileTabularText,
    textAlign: "center",
    includeFontPadding: false,
  },
  textSm: {
    ...mobileText.micro,
    ...mobileTabularText,
    textAlign: "center",
    includeFontPadding: false,
  },
});

import { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { formatBadgeCount, numericBadgeSize, type NumericBadgeSize } from "@dubgrid/design-tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileTabularText, mobileText, type MobileColors } from "../theme/tokens";

export type NumericBadgeTone = "danger" | "brand" | "secondary" | "neutral" | "onAccent";

/**
 * The solid tones take the button fills rather than the shared semantic
 * colours: a white number on dark-mode `brand` (#2075FF) measures 4.16:1 and
 * on red-500 `danger` 3.76:1, both under AA, which the one-step-darker button
 * fills were chosen to clear. `contrast.test.ts` holds every pair.
 */
export function createNumericBadgeToneStyles(
  mobileColors: MobileColors,
): Record<NumericBadgeTone, { backgroundColor: string; color: string }> {
  return {
    danger: { backgroundColor: mobileColors.buttonDangerBg, color: mobileColors.textInverse },
    brand: { backgroundColor: mobileColors.buttonPrimaryBg, color: mobileColors.textInverse },
    // The secondary button's pair, so a count beside a secondary-toned pill
    // (the "44.5h this week" hours pill) reads as the same family.
    secondary: {
      backgroundColor: mobileColors.controlSecondaryBg,
      color: mobileColors.controlSecondaryFg,
    },
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
  const toneStyle = useMemo(() => createNumericBadgeToneStyles(mobileColors), [mobileColors])[tone];
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
        // A floating dot sits on a fixed icon ring, so it holds its size; an
        // inline count grows a little with the label beside it.
        fit={size === "sm" ? "fixed" : "compact"}
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

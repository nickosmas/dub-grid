import { useMemo, type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { usePressAnimation } from "../motion/usePressAnimation";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { mobileRadii, mobileSpace, mobileText, type MobileColors } from "../theme/tokens";
import { useAsyncAction } from "../hooks/useAsyncAction";

export type ChipTone = "neutral" | "brand" | "success" | "warning" | "danger";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Brings a 24pt pill up to the 44pt minimum touch target. */
const CHIP_HIT_SLOP = { top: 10, bottom: 10, left: 0, right: 0 } as const;

/**
 * A small solid pill for status, metadata and filter selection.
 *
 * Every tone is a solid tint with no border, matching `Button`. Chips were
 * previously hand-rolled per feature with a 1px border each, which is what made
 * dense screens look busy: on a list of six chips the borders read as noise
 * before the fills read as meaning.
 */
export function Chip({
  children,
  label,
  tone = "neutral",
  icon,
  selected = false,
  disabled = false,
  accessibilityLabel,
  onPress,
}: PropsWithChildren<{
  label?: string;
  tone?: ChipTone;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Selected chips promote to the brand fill. Only meaningful when pressable. */
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Omit for a display-only chip, which renders as a plain View. */
  onPress?: () => unknown;
}>) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const resolvedTone: ChipTone = selected ? "brand" : tone;
  const palette = TONE[resolvedTone];

  const { animatedStyle, pressHandlers, androidRipple } = usePressAnimation({
    enabled: !disabled && Boolean(onPress),
    rippleColor: mobileColors.rippleNeutral,
  });

  const body = (
    <>
      {icon ? (
        <Ionicons
          color={mobileColors[palette.label]}
          name={icon}
          size={mobileText.label.fontSize}
        />
      ) : null}
      <Text style={[mobileText.label, { color: mobileColors[palette.label] }]}>
        {children ?? label}
      </Text>
    </>
  );

  const chipStyle = [
    styles.chip,
    { backgroundColor: mobileColors[palette.background] },
    disabled && styles.chipDisabled,
  ];

  // Latched here rather than at each call site: these press handlers are
  // synchronous today, and the latch returns early for those, but nothing
  // stops a caller passing one that fires a request.
  const action = useAsyncAction(onPress ?? (() => {}));

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={chipStyle}>
        {body}
      </View>
    );
  }

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      android_ripple={androidRipple}
      disabled={disabled}
      // A chip is 24pt tall (16 line height plus its padding), well under the
      // 44pt minimum touch target. Pad the deficit out rather than growing the
      // pill, which is drawn small on purpose. Vertical only: chips sit in rows
      // 8pt apart, so a horizontal slop would overlap the neighbour's target.
      hitSlop={CHIP_HIT_SLOP}
      onPress={action.run}
      {...pressHandlers}
      style={[...chipStyle, animatedStyle]}
    >
      {body}
    </AnimatedPressable>
  );
}

/** Soft fills, so a chip never competes with a primary action for attention. */
const TONE = {
  neutral: { background: "controlNeutralBg", label: "textSecondary" },
  brand: { background: "controlSecondaryBg", label: "controlSecondaryFg" },
  success: { background: "successSoft", label: "successText" },
  warning: { background: "warningSoft", label: "warningText" },
  danger: { background: "dangerSoft", label: "dangerText" },
} as const satisfies Record<
  ChipTone,
  { background: keyof MobileColors; label: keyof MobileColors }
>;

const createStyles = (_mobileColors: MobileColors) =>
  StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: mobileSpace.xs,
      borderRadius: mobileRadii.pill,
      borderWidth: 0,
      paddingHorizontal: mobileSpace.md,
      paddingVertical: mobileSpace.xs,
    },
    chipDisabled: {
      opacity: 0.4,
    },
  });

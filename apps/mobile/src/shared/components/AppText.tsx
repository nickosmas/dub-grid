import { useMemo, type PropsWithChildren } from "react";
import { type StyleProp, type TextProps, type TextStyle } from "react-native";
import { Text } from "./Text";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE, mobileText, type MobileColors } from "../theme/tokens";

export type TextVariant = keyof typeof mobileText;

export type TextTone =
  | "primary"
  | "secondary"
  | "muted"
  | "subtle"
  | "inverse"
  | "brand"
  | "danger"
  | "warning"
  | "success"
  | "onBrand";

/**
 * Exported as a pure function because the test harness drops the `style` prop
 * before it reaches the DOM, so this mapping is not observable through a
 * rendered tree. It is also the piece worth pinning: a tone pointing at the
 * wrong token is a dark-mode bug that renders fine in light mode.
 */
export const getTextToneColors = (mobileColors: MobileColors): Record<TextTone, string> => ({
  primary: mobileColors.textPrimary,
  secondary: mobileColors.textSecondary,
  muted: mobileColors.textMuted,
  subtle: mobileColors.textSubtle,
  inverse: mobileColors.textInverse,
  brand: mobileColors.brand,
  danger: mobileColors.dangerText,
  warning: mobileColors.warningText,
  success: mobileColors.successText,
  onBrand: mobileColors.onBrandText,
});

/**
 * Typography with a theme-correct colour baked in.
 *
 * The typography tokens carry size, weight and line height but no colour, so
 * every screen that used them had to re-specify `color` in its own StyleSheet
 * entry. That is the single most repeated line in the app, and it's the one
 * most likely to be wrong in dark mode. Here the default is correct.
 *
 * `style` still wins over both, for the genuine one-offs.
 */
export function AppText({
  variant = "body",
  tone = "primary",
  align,
  style,
  children,
  ...textProps
}: PropsWithChildren<
  {
    variant?: TextVariant;
    tone?: TextTone;
    align?: TextStyle["textAlign"];
    style?: StyleProp<TextStyle>;
  } & Omit<TextProps, "style">
>) {
  const mobileColors = useMobileColors();
  const tones = useMemo(() => getTextToneColors(mobileColors), [mobileColors]);

  return (
    <Text
      // The app-wide ceiling on OS text scaling. Overridable per call site by
      // passing `maxFontSizeMultiplier` through, since it spreads after this.
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[
        mobileText[variant],
        { color: tones[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...textProps}
    >
      {children}
    </Text>
  );
}

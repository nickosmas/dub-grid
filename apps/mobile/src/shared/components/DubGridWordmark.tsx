import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { MAX_FONT_SCALE_FIXED, mobileBrandTypography } from "../theme/tokens";

/**
 * The DubGrid brand wordmark for native.
 *
 * Mirrors `apps/web/src/components/Logo.tsx` (`DubGridWordmark`):
 *   - Lowercase "dubgrid"
 *   - DM Sans Bold (weight 700)
 *   - Letter-spacing -2% of font size (RN takes an absolute value)
 *   - Defaults to the theme's primary text color
 *
 * The DM Sans Bold font is loaded in `app/_layout.tsx` via
 * `@expo-google-fonts/dm-sans`. If you change the loaded weight here,
 * update that file too.
 */
export function DubGridWordmark({
  fontSize = 26,
  color,
  style,
  ...rest
}: {
  fontSize?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
} & Omit<TextProps, "style" | "children">) {
  // Defaulting to a fixed near-black would render the wordmark invisible on a
  // dark surface. Both current call sites pass a theme color explicitly; this
  // keeps that true for any that don't.
  const mobileColors = useMobileColors();

  return (
    <Text
      {...rest}
      maxFontSizeMultiplier={MAX_FONT_SCALE_FIXED}
      style={[
        styles.wordmark,
        { fontSize, color: color ?? mobileColors.textPrimary, letterSpacing: fontSize * -0.02 },
        style,
      ]}
    >
      dubgrid
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    // Family only. The file is already bold, and adding `fontWeight: "700"`
    // next to it drops Android onto the system font instead.
    fontFamily: mobileBrandTypography.wordmark.fontFamily,
    // includeFontPadding (Android) leaves visible whitespace above and below
    // the glyph baseline that throws off the brand spacing.
    includeFontPadding: false,
  },
});

import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from "react-native";

/**
 * The DubGrid brand wordmark for native.
 *
 * Mirrors `apps/web/src/components/Logo.tsx` (`DubGridWordmark`):
 *   - Lowercase "dubgrid"
 *   - DM Sans Bold (weight 700)
 *   - Letter-spacing -2% of font size (RN takes an absolute value)
 *   - Default color #111827
 *
 * The DM Sans Bold font is loaded in `app/_layout.tsx` via
 * `@expo-google-fonts/dm-sans`. If you change the loaded weight here,
 * update that file too.
 */
export function DubGridWordmark({
  fontSize = 26,
  color = "#111827",
  style,
  ...rest
}: {
  fontSize?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
} & Omit<TextProps, "style" | "children">) {
  return (
    <Text
      {...rest}
      style={[
        styles.wordmark,
        { fontSize, color, letterSpacing: fontSize * -0.02 },
        style,
      ]}
    >
      dubgrid
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: "DMSans_700Bold",
    fontWeight: "700",
    // includeFontPadding (Android) leaves visible whitespace above and below
    // the glyph baseline that throws off the brand spacing.
    includeFontPadding: false,
  },
});

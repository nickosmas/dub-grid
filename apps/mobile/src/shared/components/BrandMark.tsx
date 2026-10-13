import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import {
  BRAND_MARK_COLORS,
  BRAND_MARK_INK,
  getBrandLockupSymbolLayout,
} from "@dubgrid/design-tokens";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import { DubGridWordmark } from "./DubGridWordmark";

// White and cropped to the symbol's ink; tinted per use. Rendered by
// `npm run icons` from the shared geometry.
const SOURCE = require("../../../assets/images/brand-mark.png");
const ASPECT = BRAND_MARK_INK.height / BRAND_MARK_INK.width;

export function useBrandMarkColor(): string {
  return useIsDarkMode() ? BRAND_MARK_COLORS.dark : BRAND_MARK_COLORS.light;
}

/** The two-card symbol, cropped to its ink, `width` wide. */
export function BrandSymbol({
  width,
  color,
  style,
}: {
  width: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}) {
  const themeColor = useBrandMarkColor();
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      source={SOURCE}
      style={[{ width, height: width * ASPECT, tintColor: color ?? themeColor }, style]}
    />
  );
}

/** Symbol and wordmark on one line, the symbol centered on the word's optical center. */
export function DubGridLockup({
  fontSize = 20,
  color,
  markColor,
}: {
  fontSize?: number;
  color?: string;
  markColor?: string;
}) {
  const layout = getBrandLockupSymbolLayout(fontSize);
  return (
    <View style={styles.row}>
      {/* Baseline alignment sits the image's bottom on the text baseline; the
          translate drops it to where its center meets the word's. */}
      <BrandSymbol
        width={layout.width}
        color={markColor}
        style={{
          marginRight: layout.marginRight,
          transform: [{ translateY: layout.belowBaseline }],
        }}
      />
      <DubGridWordmark fontSize={fontSize} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
});

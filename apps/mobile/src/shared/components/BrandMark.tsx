import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SMALL_MAX_PX,
  getBrandSymbolLockupLayout,
} from "@dubgrid/design-tokens";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import { DubGridWordmark } from "./DubGridWordmark";

// The two cards as white layers cropped to the symbol's ink, the gap cut into
// the back card; tinted per use. Rendered by `npm run icons` from the shared
// geometry, with a wider gap for 32 px and below.
const BACK = require("../../../assets/images/brand-mark-back.png");
const BACK_SMALL = require("../../../assets/images/brand-mark-back-small.png");
const FRONT = require("../../../assets/images/brand-mark-front.png");
const ASPECT = BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height;

export function useBrandMarkColors(): { back: string; front: string } {
  return useIsDarkMode() ? BRAND_SYMBOL_COLORS.dark : BRAND_SYMBOL_COLORS.light;
}

/** The two-card symbol, cropped to its ink, `height` tall. */
export function BrandSymbol({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const colors = useBrandMarkColors();
  const size = { width: height * ASPECT, height };
  return (
    <View
      accessibilityIgnoresInvertColors
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={[size, style]}
    >
      <Image
        source={height <= BRAND_SYMBOL_SMALL_MAX_PX ? BACK_SMALL : BACK}
        style={[StyleSheet.absoluteFill, { tintColor: colors.back }]}
      />
      <Image source={FRONT} style={[StyleSheet.absoluteFill, { tintColor: colors.front }]} />
    </View>
  );
}

/** Symbol and wordmark on one line, the symbol centered on the word's optical center. */
export function DubGridLockup({ fontSize = 20, color }: { fontSize?: number; color?: string }) {
  const layout = getBrandSymbolLockupLayout(fontSize);
  return (
    <View style={styles.row}>
      {/* Baseline alignment sits the symbol's bottom on the text baseline; the
          translate drops it to where its center meets the word's. */}
      <BrandSymbol
        height={layout.height}
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

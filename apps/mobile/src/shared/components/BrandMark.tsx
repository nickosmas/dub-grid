import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SMALL_MAX_PX,
  getBrandSymbolLockupLayout,
  type BrandSymbolTone,
} from "@dubgrid/design-tokens";
import { useIsDarkMode } from "../providers/ThemeModeProvider";
import { DubGridWordmark } from "./DubGridWordmark";

// The three cards as white layers cropped to the symbol's ink, each with the
// gap cut around the cards in front of it; tinted per use. Rendered by `npm
// run icons` from the shared geometry, with a wider gap for 32 px and below.
const LAYERS: readonly { regular: number; small: number; tone: BrandSymbolTone }[] = [
  {
    regular: require("../../../assets/images/brand-mark-back.png"),
    small: require("../../../assets/images/brand-mark-back-small.png"),
    tone: "side",
  },
  {
    regular: require("../../../assets/images/brand-mark-center.png"),
    small: require("../../../assets/images/brand-mark-center-small.png"),
    tone: "center",
  },
  {
    regular: require("../../../assets/images/brand-mark-front.png"),
    small: require("../../../assets/images/brand-mark-front.png"),
    tone: "side",
  },
];
const ASPECT = BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height;

export function useBrandMarkColors(): Record<BrandSymbolTone, string> {
  return useIsDarkMode() ? BRAND_SYMBOL_COLORS.dark : BRAND_SYMBOL_COLORS.light;
}

/** The three-card symbol, cropped to its ink, `height` tall. */
export function BrandSymbol({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const colors = useBrandMarkColors();
  const size = { width: height * ASPECT, height };
  const small = height <= BRAND_SYMBOL_SMALL_MAX_PX;
  return (
    <View
      accessibilityIgnoresInvertColors
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={[size, style]}
    >
      {LAYERS.map((layer, index) => (
        <Image
          key={index}
          source={small ? layer.small : layer.regular}
          // Sized explicitly rather than by `absoluteFill`: react-native-web
          // draws an unsized image at its 512 px source size whatever its
          // offsets say.
          style={[styles.layer, size, { tintColor: colors[layer.tone] }]}
        />
      ))}
    </View>
  );
}

/**
 * Symbol and wordmark on one line, the word's optical center level with the
 * visible middle of the symbol's center card.
 */
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
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
});

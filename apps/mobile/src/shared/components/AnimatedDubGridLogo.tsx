import { View } from "react-native";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SQUARE,
} from "@dubgrid/design-tokens";
import { BrandSymbol } from "./BrandMark";

/**
 * The splash mark: the symbol centered in a `size` square, drawn exactly as
 * the native launch image is (`npm run icons`), so the launch hands off
 * without a seam. Static until mobile has a renderer for the stacked mark's
 * animations (`blueprint/reference/stack-logo-animations.md`); callers keep
 * this component so motion can arrive without touching them.
 */
export function AnimatedDubGridLogo({ size = BRAND_ANIMATED_LOGO_SIZE }: { size?: number }) {
  const scale = size / BRAND_SYMBOL_SQUARE.size;
  return (
    <View style={{ width: size, height: size }}>
      <BrandSymbol
        height={BRAND_SYMBOL_INK.height * scale}
        style={{
          position: "absolute",
          left: -BRAND_SYMBOL_SQUARE.x * scale,
          top: -BRAND_SYMBOL_SQUARE.y * scale,
        }}
      />
    </View>
  );
}

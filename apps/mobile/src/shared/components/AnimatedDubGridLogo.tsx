import { View } from "react-native";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_MARK_INK,
  BRAND_MARK_SQUARE,
} from "@dubgrid/design-tokens";
import { BrandSymbol } from "./BrandMark";

/**
 * The splash mark: the symbol optically centered in a `size` square, drawn
 * exactly as the native launch image is (`npm run icons`), so the launch
 * hands off without a seam. Static until the two-card animations land
 * (`blueprint/reference/logo-animations.md`); callers keep this component so
 * motion can return without touching them.
 */
export function AnimatedDubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const scale = size / BRAND_MARK_SQUARE.size;
  return (
    <View style={{ width: size, height: size }}>
      <BrandSymbol
        width={BRAND_MARK_INK.width * scale}
        color={color}
        style={{
          position: "absolute",
          left: (BRAND_MARK_INK.x - BRAND_MARK_SQUARE.x) * scale,
          top: (BRAND_MARK_INK.y - BRAND_MARK_SQUARE.y) * scale,
        }}
      />
    </View>
  );
}

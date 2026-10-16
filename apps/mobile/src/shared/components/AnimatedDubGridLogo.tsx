import { useEffect, useMemo, useState } from "react";
import { Image, View } from "react-native";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  brandMotionFrames,
  brandRestFrame,
  type BrandAnimation,
  type BrandMotionFrame,
} from "@dubgrid/design-tokens";
import { layoutBrandFrame, type BrandFrameImage } from "../lib/brand-frame-layout";
import { useMotionPreference } from "../motion/useMotionPreference";
import { useMobileColors } from "../providers/ThemeModeProvider";
import { useBrandMarkColors } from "./BrandMark";

const IMAGES: Record<BrandFrameImage, number> = {
  card: require("../../../assets/images/brand-mark-card.png"),
  halo: require("../../../assets/images/brand-mark-halo.png"),
  "halo-side": require("../../../assets/images/brand-mark-halo-side.png"),
};
const REST = brandRestFrame();

/** Loops `animation` from mount on the rest frame; reduced motion rests. */
function useBrandAnimation(animation: BrandAnimation): BrandMotionFrame {
  const { enabled } = useMotionPreference();
  const [frame, setFrame] = useState<BrandMotionFrame>(REST);

  useEffect(() => {
    if (!enabled) {
      setFrame(REST);
      return;
    }
    let raf = 0;
    const began = Date.now();
    const tick = () => {
      setFrame(brandMotionFrames[animation]((Date.now() - began) / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, enabled]);

  return frame;
}

/**
 * The full-screen loading mark, looping `animation` in a `size` square. Its
 * rest frame is the native launch image (`npm run icons`), so the splash
 * hands off without a seam. The gaps are painted in `surfaceColor`, which
 * must be the plain color behind the mark (the screen background by default).
 * Spec: `blueprint/reference/stack-logo-animations.md`.
 */
export function AnimatedDubGridLogo({
  animation = "breathe",
  size = BRAND_ANIMATED_LOGO_SIZE,
  surfaceColor,
}: {
  animation?: BrandAnimation;
  size?: number;
  surfaceColor?: string;
}) {
  const frame = useBrandAnimation(animation);
  const colors = useBrandMarkColors();
  const mobileColors = useMobileColors();
  const surface = surfaceColor ?? mobileColors.background;
  const pieces = useMemo(
    () => layoutBrandFrame(frame, size, colors, surface),
    [frame, size, colors, surface],
  );

  return (
    <View
      accessibilityIgnoresInvertColors
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      {pieces.map(({ image, tint, ...box }, index) => (
        <Image
          key={index}
          source={IMAGES[image]}
          style={{ position: "absolute", ...box, tintColor: tint }}
        />
      ))}
    </View>
  );
}

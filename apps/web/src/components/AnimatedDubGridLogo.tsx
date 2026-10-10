import { BRAND_ANIMATED_LOGO_SIZE } from "@dubgrid/design-tokens";
import { DubGridLogo } from "./Logo";

/**
 * The splash and loading mark. Static until the two-card animations land
 * (`blueprint/reference/logo-animations.md`); its callers keep this
 * component so motion can return without touching them.
 */
export function AnimatedDubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color,
}: {
  size?: number;
  color?: string;
}) {
  return <DubGridLogo size={size} color={color} />;
}

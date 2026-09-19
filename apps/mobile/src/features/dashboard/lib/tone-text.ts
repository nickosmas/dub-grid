import type { CountBadgeTone } from "../components/CountBadge";
import type { MobileColors } from "../../../shared/theme/tokens";

/**
 * The text colour for a tone, for a dashboard row that names a fact in
 * colour rather than wrapping it in a pill. Same tones as `CountBadge`, so a
 * "Swap" here and a Swap badge on the Requests tab are the same colour.
 */
export function createToneTextColors(mobileColors: MobileColors): Record<CountBadgeTone, string> {
  return {
    brand: mobileColors.brand,
    warning: mobileColors.warningText,
    danger: mobileColors.dangerText,
    success: mobileColors.successText,
  };
}

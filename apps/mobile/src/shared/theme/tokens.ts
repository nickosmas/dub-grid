import {
  borderColorFromText,
  colorTokens,
  darkColorTokens,
  mobileNavigationTheme,
  mobileTypographyTokens,
  overlayTokens,
  radiusTokens,
  resolveShiftPillColors,
  spacingTokens,
} from "@dubgrid/design-tokens";
import type { TextStyle } from "react-native";

export const mobileColors = {
  ...colorTokens,
  overlay: overlayTokens.background,
} as const;
export const darkMobileColors = {
  ...darkColorTokens,
  overlay: overlayTokens.background,
} as const;
export type MobileColors = Record<keyof typeof mobileColors, string>;
export const mobileSpacing = spacingTokens;
export const mobileRadii = radiusTokens;
export const mobileTypography = mobileTypographyTokens;
export const dubGridNavigationTheme = mobileNavigationTheme;
export const mobileBorderColorFromText = borderColorFromText;

/**
 * `jobs.border_color` and `absence_types.border_color` both default to
 * `'transparent'` in the schema and the color picker never writes anything
 * else, so a stored border is almost always that sentinel. Rendering it (or
 * falling back to the chip's own fill) leaves the pill with no visible edge in
 * light mode, while dark mode derives one from the text. Fall back to the same
 * text-derived tint so both themes match.
 */
export function mobileVisiblePillBorder(
  border: string | null | undefined,
  textHex: string,
): string {
  const stored = border?.trim();
  if (!stored || stored.toLowerCase() === "transparent") return borderColorFromText(textHex);
  return stored;
}

export type MobilePillTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

/**
 * User-picked hex colors from the backend are tuned for a white page and read
 * as blown-out on a dark surface, so remap them through the shared HSV
 * darkener. Theme tokens (mobileColors.*) are already theme-correct and must
 * NOT be passed through this a second time.
 */
export function mobileDarkenTone(tone: MobilePillTone, isDark: boolean): MobilePillTone {
  if (!isDark) return tone;

  const resolved = resolveShiftPillColors(
    { color: tone.backgroundColor, text: tone.textColor, border: tone.borderColor },
    true,
  );

  return {
    backgroundColor: resolved.color,
    borderColor: resolved.border,
    textColor: resolved.text,
  };
}

export const mobileText = mobileTypographyTokens.text satisfies Record<string, TextStyle>;

import {
  borderColorFromText,
  colorTokens,
  darkColorTokens,
  getMobileEasingCurve,
  getMobileElevation,
  getMobileIconToneColor,
  getSoftGradientStops,
  mobileMotionTokens,
  mobileNavigationTheme,
  mobileRadiusTokens,
  mobileSpacingTokens,
  mobileTypographyTokens,
  overlayTokens,
  radiusTokens,
  resolveShiftPillColors,
  softGradientTokens,
  spacingTokens,
  type MobileDurationName,
  type MobileEasingCurve,
  type MobileEasingName,
  type MobileElevation,
  type MobileElevationLevel,
  type MobileIconToneName,
  type MobileSpringConfig,
  type MobileSpringName,
  type SoftGradientKind,
} from "@dubgrid/design-tokens";
import type { TextStyle, ViewStyle } from "react-native";

/**
 * Mobile-only color overrides and additions.
 *
 * These stay here rather than in `@dubgrid/design-tokens` because that package
 * is shared with the web app, where `background`/`surface`/`surfaceSecondary`
 * feed several hundred CSS-variable call sites, the shadcn bridge and every
 * transactional email. Mobile needs different values for a touch UI; web does
 * not have to move.
 *
 * ## Why these values
 * The soft button fills are borderless by design, so they have nothing *but*
 * their fill to define them, and the shared light values are too close to a
 * white card to register.
 *
 * Honest limit: a light fill on a light page cannot reach WCAG's 3:1 for
 * non-text UI, and no design system achieves it. These values land around
 * 1.28:1, which is clearly perceivable. The accessibility guarantee is the
 * *label* contrast (13.4:1 neutral, 5.2:1 secondary), not the fill.
 */
const MOBILE_LIGHT = {
  /**
   * The light page: a soft blue the white cards sit on.
   *
   * Same hue as the brand wash gradient's lightest stop (#F1F6FF), nudged
   * darker. That exact value measures only 1.06:1 against a white card, which
   * is not a perceivable edge; this lands at 1.14:1, so the page reads as blue
   * without cards dissolving into it. The earlier neutral (#EBEFF5) hit the
   * same ratio but gray, which read as dirty next to the brand.
   *
   * Dark mode is untouched — its surfaces already separate on their own.
   */
  background: "#EAF1FC",
  /** Neutral control fill. On a white card: 1.10 -> 1.28. */
  controlNeutralBg: "#DDE4ED",
  /** Secondary control fill. On a white card: 1.09 -> 1.28. */
  controlSecondaryBg: "#D6E4FB",
  /**
   * Secondary control label. Darkened alongside its fill: keeping the standard
   * `brand` blue on the darker fill would drop the label to 4.03:1 and fail AA.
   * This pairing measures 5.22:1.
   */
  controlSecondaryFg: "#1D4ED8",
  /**
   * Card edge. Transparent in light mode: the page is tinted enough that a
   * white card reads on its own, and a border on top of the shadow looks like
   * an outline sticker.
   *
   * Transparent rather than `borderWidth: 0` so the 1px still occupies layout
   * and nothing reflows when the theme flips.
   */
  cardBorder: "transparent",
  /**
   * Skeleton placeholder fill. Has to read on *both* grounds a skeleton lands
   * on: a white card and the `#EAF1FC` page. `borderSubtle` (#E2E8F0) was the
   * old fill and measures 1.13:1 on white, which barely registers as a shape;
   * this lands at 1.24:1 there and 1.09:1 on the page, so a block is legible
   * wherever it sits. Same blue-tinted slate family as the rest of the light
   * ramp.
   */
  skeletonBase: "#DCE4EE",
  /**
   * The travelling shimmer band. White at partial alpha rather than a lighter
   * solid, so the band works over the fill above without a second token per
   * surface. Paired with the dark value below by *perceived* intensity: the
   * two used to be 0.85 and 0.07, which read as two different effects.
   */
  skeletonHighlight: "rgba(255,255,255,0.62)",
} as const;

const MOBILE_DARK = {
  /** Dark surfaces already separate well, so the page background is unchanged. */
  background: darkColorTokens.background,
  controlNeutralBg: "#26262B",
  controlSecondaryBg: "#1B2E4E",
  /** Brighter than light mode's, to stay legible on a dark fill. */
  controlSecondaryFg: "#7FB0FF",
  /**
   * Dark mode keeps the hairline: a shadow against a near-black page is
   * invisible, so the edge is the only thing separating a card from it.
   */
  cardBorder: darkColorTokens.borderSubtle,
  /**
   * Sits between `surface` (#121214) and `borderSubtle` (#2A2A2F): light
   * enough to read as a filled shape on a card, dark enough not to glow.
   */
  skeletonBase: "#232329",
  /**
   * Far lower alpha than light mode's, because a white band over a near-black
   * fill is a much larger perceptual step. Tuned so the sweep reads at the
   * same strength in both themes.
   */
  skeletonHighlight: "rgba(255,255,255,0.055)",
} as const;

export const mobileColors = {
  ...colorTokens,
  ...MOBILE_LIGHT,
  overlay: overlayTokens.background,
} as const;
export const darkMobileColors = {
  ...darkColorTokens,
  ...MOBILE_DARK,
  overlay: overlayTokens.background,
} as const;
export type MobileColors = Record<keyof typeof mobileColors, string>;
/** Named layout slots (screen gutter, section gap, card gap). */
export const mobileSpacing = spacingTokens;
/** The 4/8/12/16/20/24/32/40/48 ramp — reach for this for ad-hoc spacing. */
export const mobileSpace = mobileSpacingTokens;
/** Named radii for the three surface roles (card, control, pill). */
export const mobileRadii = radiusTokens;
/** Small-surface radius ramp for chips, inputs and inline badges. */
export const mobileRadius = mobileRadiusTokens;
export const mobileTypography = mobileTypographyTokens;
export const dubGridNavigationTheme = mobileNavigationTheme;
export const mobileBorderColorFromText = borderColorFromText;
/** Durations, springs and easing curves. See `shared/motion` for the hooks. */
export const mobileMotion = mobileMotionTokens;
/** Soft brand washes. Render them through `<GradientBackdrop>`, not by hand. */
export { getMobileIconToneColor as mobileIconToneColor };
export type { MobileIconToneName };

export const mobileSoftGradient = softGradientTokens;

/**
 * `brandWashLight`'s last stop is the *web* page colour (#F8FAFC), which is
 * what makes the wash dissolve into the page rather than ending as a band.
 * Mobile's page is a different colour, so the shared stops stop on the wrong
 * one and leave a visible seam partway down the screen.
 *
 * Re-tinted here rather than in `@dubgrid/design-tokens` for the same reason
 * the colour overrides above live here: that package is shared with the web
 * app, whose own gradient is correct as it stands.
 */
const MOBILE_BRAND_WASH_LIGHT = ["#F2F6FE", "#EDF3FD", MOBILE_LIGHT.background] as const;

export function mobileSoftGradientStops(
  kind: SoftGradientKind,
  isDark: boolean,
): readonly [string, string, string] {
  if (kind === "brandWash" && !isDark) {
    return MOBILE_BRAND_WASH_LIGHT;
  }

  return getSoftGradientStops(kind, isDark);
}
export { getMobileEasingCurve as mobileEasingCurve };
export type {
  MobileDurationName,
  MobileEasingCurve,
  MobileEasingName,
  MobileElevation,
  MobileElevationLevel,
  MobileSpringConfig,
  MobileSpringName,
  SoftGradientKind,
};

/**
 * The named shadow levels, resolved for the current theme. Spread into a style:
 *
 *     card: { ...mobileElevation("card", isDark), backgroundColor: colors.surface }
 *
 * Android reads only `elevation`, and it paints nothing against a transparent
 * background, so the fill has to be on the same view.
 */
export function mobileElevation(
  level: MobileElevationLevel,
  isDark: boolean,
): MobileElevation & ViewStyle {
  return getMobileElevation(level, isDark);
}

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

export type MobileTextVariant = keyof typeof mobileTypographyTokens.text;
// Keyed off fontWeight, not fontFamily: the family map carries an extra
// `base` alias that has no matching weight.
export type MobileTextWeight = keyof typeof mobileTypographyTokens.fontWeight;

/**
 * A typography token at a different weight, with the font *family* moved to
 * match.
 *
 * DM Sans is loaded as four separate family files, and every `mobileText` token
 * sets both a family and its matching `fontWeight`. Overriding only the weight
 * (`{ ...mobileText.body, fontWeight: "500" }`) leaves the two disagreeing:
 * iOS honours the family and renders regular, while Android may synthesize a
 * fake medium. The result is text that renders at different weights on the two
 * platforms from the same style.
 *
 * DM Sans has no weight above 700, so heavier requests resolve to bold.
 */
export function mobileTextWeighted(
  variant: MobileTextVariant,
  weight: MobileTextWeight,
): TextStyle {
  return {
    ...mobileTypographyTokens.text[variant],
    fontFamily: mobileTypographyTokens.fontFamily[weight],
    fontWeight: mobileTypographyTokens.fontWeight[weight],
  };
}

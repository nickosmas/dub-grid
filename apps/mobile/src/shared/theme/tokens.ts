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
 * non-text UI, and no design system achieves it. These land at 1.22:1 (neutral)
 * and 1.28:1 (secondary) against the white page — perceivable, but only just,
 * and the neutral one is deliberately near that line. The accessibility
 * guarantee is the *label* contrast (12.0:1 neutral, 5.2:1 secondary), not the
 * fill.
 */
/**
 * Fills for `<Button>`'s solid tones. Deliberately fixed across themes, the way
 * `toastToneTokens` are and the way `warning` already was: a solid button is a
 * high-emphasis control rather than a themed surface, so it reads the same in
 * both.
 *
 * Three of them are *not* the shared `brand`/`success`/`danger` semantic
 * tokens, and must not be folded back into them. Those tint icons, banners and
 * count badges, where the colour sits next to text rather than under it and a
 * lighter, more saturated value is the right call. Under a white label the same
 * values fail WCAG AA badly: dark green-500 measures 2.28:1, red-500 3.76:1.
 * This is the same split, and the same reasoning, that gave
 * `controlSecondaryFg` its own value apart from `brand`. Each is a step down
 * its Tailwind ramp from the semantic token it shadows, so the depth moves and
 * the family does not.
 *
 * `warning` is the exception, and it is the one tone the two apps share by
 * value: see `buttonWarningBg`. `contrast.test.ts` holds every fill at 4.5:1
 * against the label it actually renders — which is white for all but that one.
 */
const BUTTON_SOLID_FILLS = {
  /** blue-600. Matches light `brand`; dark's brighter #2075FF measured 4.16:1. */
  buttonPrimaryBg: "#2563EB",
  /** red-600, one step down from the shared red-500 `danger`. */
  buttonDangerBg: "#DC2626",
  /** green-700, below the shared green-500/600 `success`. */
  buttonSuccessBg: "#15803D",
  /**
   * amber-500 — the web app's `--color-warning`, which is what
   * `.dg-btn-warning-filled` paints Deactivate with. The two apps show the same
   * action in the same orange, so this is a shared value rather than a
   * mobile-only pick.
   *
   * It got there the other way round from its neighbours. Holding a white label
   * capped the fill at orange-700 (#C2410C, 5.18:1) — the burnt, nearly brown
   * end of the range, and visibly not web's amber. Darkening the *label*
   * instead frees the fill: `buttonWarningFg` on this measures 6.97:1, better
   * than the white-on-orange-700 it replaces, so parity costs no contrast.
   */
  buttonWarningBg: "#F59E0B",
  /**
   * amber-950, the only solid-tone label that is not white.
   *
   * Web pairs its amber with white at 2.15:1, which is the one part of that
   * button not worth copying. Deep warm brown stays inside the amber family, so
   * the button still reads as one colour rather than as a black label dropped
   * on orange.
   */
  buttonWarningFg: "#451A03",
} as const;

const MOBILE_LIGHT = {
  ...BUTTON_SOLID_FILLS,
  /**
   * The light page: plain white, the same value as `surface`.
   *
   * This is a deliberate reversal. The page used to be a slate gray (#EFF2F6)
   * so that white cards separated from it by fill alone, at 1.12:1 — and that
   * ratio was the *only* thing drawing a card's edge, since `cardBorder` is
   * transparent in light mode. Product direction is now a white page with cards
   * lifted off it, so the separation moves wholesale from fill to shadow:
   * `mobileElevation("card")` carries it, and it was strengthened in the same
   * change precisely because it is now load-bearing rather than decorative.
   *
   * The consequence to keep in mind: **a card with no elevation is invisible in
   * light mode.** Anything that wants to read as a distinct surface on this page
   * needs `getCardSurfaceStyle` (or its own elevation), not just `surface` as a
   * fill. `contrast.test.ts` no longer holds a card/page fill ratio for that
   * reason, and holds the shadow's strength instead.
   *
   * The neutral *fills* that sit on this page (`controlNeutralBg`,
   * `skeletonBase`) keep their slate tint and now carry more of the visual
   * weight, since they are the only tinted shapes left on a white ground.
   *
   * Dark mode is untouched — its surfaces already separate on their own.
   */
  background: "#FFFFFF",
  /**
   * Neutral control fill — the Filter button, chips, the segmented-control
   * track, and `tone="plain"`.
   *
   * Lightened from #DFE3E9 (1.288:1) to 1.219:1 against white, by direction.
   * Worth knowing what that spends: buttons carry neither a border nor a
   * shadow, so this fill is the *only* thing drawing one, and `contrast.test.ts`
   * had to drop its soft-fill floor from 1.25 to 1.20 to admit it. That floor
   * exists because borderless controls once shipped at 1.04:1, which is not a
   * perceivable edge — this now sits much nearer that line than before, and
   * anything lighter needs a border or a shadow bought back first.
   */
  controlNeutralBg: "#E5E9EE",
  /** Secondary control fill. On a white card: 1.09 -> 1.28. */
  controlSecondaryBg: "#D6E4FB",
  /**
   * Secondary control label. Darkened alongside its fill: keeping the standard
   * `brand` blue on the darker fill would drop the label to 4.03:1 and fail AA.
   * This pairing measures 5.22:1.
   */
  controlSecondaryFg: "#1D4ED8",
  /**
   * Card edge. Transparent in light mode: the page is white, so a card shares
   * its fill with the ground and the shadow draws the whole edge. A stroke on
   * top of that shadow reads as an outline sticker, which is why cards carry
   * none. Dark mode keeps the hairline, where a shadow on near-black is
   * invisible and the edge is all there is.
   *
   * Transparent rather than `borderWidth: 0` so the 1px still occupies layout
   * and nothing reflows when the theme flips.
   */
  cardBorder: "transparent",
  /**
   * Skeleton placeholder fill. Both grounds a skeleton lands on — a card and the
   * page — are now white, so this only has one ratio to satisfy rather than two:
   * 1.30:1 on white. `borderSubtle` (#E2E8F0) was the old fill and measures
   * 1.13:1 there, which barely registers as a shape.
   *
   * Deliberately not lightened to follow the page. A placeholder wants *more*
   * presence than the ground it sits on, and on a white page it is now one of
   * the few tinted shapes carrying the layout.
   */
  skeletonBase: "#DEE2E8",
  /**
   * The travelling shimmer band. White at partial alpha rather than a lighter
   * solid, so the band works over the fill above without a second token per
   * surface. Paired with the dark value below by *perceived* intensity: the
   * two used to be 0.85 and 0.07, which read as two different effects.
   */
  skeletonHighlight: "rgba(255,255,255,0.62)",
  /**
   * Sheet/modal scrim. Deeper than the shared `overlayTokens.background` it
   * replaces (0.45), so a sheet reads as taking over the screen rather than
   * floating on a lightly tinted page. The shared token's navy cast (10,20,40)
   * came from the page being blue; over a slate page it reads as a blue wash
   * over gray, so the same darkness is carried on a near-neutral slate instead.
   */
  overlay: "rgba(12, 17, 26, 0.6)",
} as const;

const MOBILE_DARK = {
  ...BUTTON_SOLID_FILLS,
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
  /**
   * Sheet/modal scrim. Pure black, unlike the light theme's: the shared navy
   * scrim over a near-black page had nothing to darken and only pushed the
   * whole screen bluer. Black at a higher alpha darkens instead of tinting.
   */
  overlay: "rgba(0, 0, 0, 0.72)",
} as const;

export const mobileColors = {
  ...colorTokens,
  ...MOBILE_LIGHT,
} as const;
export const darkMobileColors = {
  ...darkColorTokens,
  ...MOBILE_DARK,
} as const;
export type MobileColors = Record<keyof typeof mobileColors, string>;
/**
 * Named layout slots (section gap, card gap).
 *
 * The screen gutter is `SCREEN_GUTTER` in `components/screen-layout`, not
 * `screenX` here: it has to line up with the navigation bar's title, which is a
 * per-platform number, and this module is imported by nearly everything and
 * stays free of runtime platform checks.
 */
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
 * A typography token at a different weight, expressed the only way DM Sans
 * understands it: by swapping the font *family*.
 *
 * DM Sans is loaded as four separate single-weight family files, so weight is
 * a property of the family name, not of `fontWeight`. Reaching for the numeric
 * weight instead (`{ ...mobileText.body, fontWeight: "500" }`) leaves the two
 * disagreeing: iOS honours the family and renders regular, while Android goes
 * looking for a bold face this one-face family doesn't have and falls back to
 * the system font. Same style, two different typefaces.
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
  };
}

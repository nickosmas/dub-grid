/**
 * React Native elevation tokens.
 *
 * `shadowTokens` / `darkShadowTokens` in `index.ts` are CSS `box-shadow`
 * strings, which React Native cannot consume at all. Mobile therefore had no
 * shadow abstraction and hand-rolled the same five properties in 14 files,
 * drifting across shadow radii of 8/10/12/14/18/20/24/28. These are the named
 * levels those blocks collapse onto.
 *
 * Typed structurally rather than as RN's `ViewStyle`, so this file stays free
 * of react-native imports and the package stays platform-neutral.
 *
 * ## Android caveat
 * `elevation` is the only property Android reads here (`shadowOffset`,
 * `shadowOpacity` and `shadowRadius` are iOS-only), and it has three
 * behaviours worth knowing before reaching for a level:
 *  - it paints nothing against a transparent `backgroundColor`, so never apply
 *    a level to a wrapper that has no fill;
 *  - it reorders siblings in z, so a raised view can jump above a later
 *    sibling that was previously drawn on top;
 *  - it always casts downward. A level that has to lean any other way needs
 *    the `boxShadow` escape hatch documented on `MobileElevation`.
 */

/** Shape of one RN `boxShadow` entry, declared structurally to keep this file free of react-native imports. */
export type MobileBoxShadow = {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  color: string;
};

export type MobileElevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
  /**
   * Set only on levels whose direction `elevation` cannot express, and always
   * alongside `elevation: 0` — Android would otherwise draw both and the two
   * shadows would stack. Requires the New Architecture (RN 0.76+), which this
   * app runs; without it Android renders no shadow for such a level at all.
   *
   * Entries compose the way Material's two lights do: an ambient shadow with
   * no offset covers every edge, and a directional one on top of it decides
   * which edge reads hardest. One offset shadow alone starves the edge it
   * leans away from, which is the whole reason a level reaches for a pair.
   */
  boxShadow?: readonly MobileBoxShadow[];
};

export type MobileElevationLevel =
  /** No shadow. Use to explicitly cancel an inherited level. */
  | "flat"
  /** Small surfaces nested inside a card: metric tiles, day cells. */
  | "raised"
  /**
   * Sticky page headers. Carries the whole separation on its own: a page header
   * draws no bottom border, so nothing but this shadow tells the reader that
   * content is passing underneath it.
   */
  | "header"
  /** The default surface treatment for cards and list tiles. */
  | "card"
  /** Detached surfaces: FAB-like controls, popovers anchored under a trigger. */
  | "float"
  /**
   * The floating tab bar. Same downward cast as `float`, but spelled out as an
   * explicit ambient + directional pair rather than left to `elevation`, whose
   * single number can't be asked for a wide all-round blur and a heavier
   * bottom edge independently.
   */
  | "floatBar"
  /** Bottom sheets. Casts *upward*, hence the negative offset. */
  | "sheet"
  /** Modal dialogs sitting above a scrim. */
  | "overlay";

export const mobileElevationTokens: Record<MobileElevationLevel, MobileElevation> = {
  flat: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /**
   * The quiet lift: small surfaces nested inside a card (the dashboard's metric
   * tiles, day cells).
   *
   * Same reasoning as `card` — on a white ground a 4% shadow was invisible, so
   * a nested white tile had no shape at all — but deliberately lighter than it.
   * These sit *inside* an already-elevated card, and matching its depth would
   * flatten the hierarchy between the two.
   */
  raised: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 0,
    boxShadow: [
      { offsetX: 0, offsetY: 1, blurRadius: 6, color: "rgba(15, 23, 42, 0.04)" },
      { offsetX: 0, offsetY: 4, blurRadius: 22, color: "rgba(15, 23, 42, 0.06)" },
    ],
  },
  /**
   * Sticky page headers, once content scrolls under them.
   *
   * Stronger than `raised`, which this replaced. A header used to pair that
   * quiet lift with a 1pt `borderSubtle` divider, and the line did the real
   * separating; the shadow only kept the bar from looking pasted on. With the
   * border gone the shadow is the whole treatment, so it has to read on its
   * own.
   *
   * A single shadow rather than the ambient + directional pair `card` uses.
   * A header spans the full width and has no side or top edges in view, so an
   * all-round ambient layer draws blur nothing can see, and its `elevation`
   * stays a real number instead of 0: Android needs one anyway to keep the bar
   * above the `card`-level tiles scrolling beneath it, and pairing that with
   * `boxShadow` would draw the cast twice.
   */
  header: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
  },
  /**
   * Cards. Load-bearing in light mode, not decorative: the mobile page is white
   * and `cardBorder` is transparent there, so a card shares its fill with the
   * ground it sits on and this shadow is the *only* thing drawing its edge.
   *
   * Two layers rather than one, for the same reason `floatBar` has two: a tight
   * layer draws the edge, a much wider ambient one gives it height.
   *
   * Tuned soft and wide — a large blur at low alpha, so a card reads as gently
   * lifted rather than outlined. The ambient layer is held just above the 0.08
   * alpha `contrast.test.ts` requires, and that floor is not decorative: with a
   * white page and no card border, this shadow is the only thing drawing a
   * card, so lowering the alpha further makes cards disappear rather than
   * merely softer.
   */
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    // Zero because `boxShadow` below owns the Android cast too — the same
    // pairing `floatBar` uses. Leaving both on double-draws the shadow.
    elevation: 0,
    boxShadow: [
      { offsetX: 0, offsetY: 1, blurRadius: 8, color: "rgba(15, 23, 42, 0.05)" },
      { offsetX: 0, offsetY: 8, blurRadius: 44, color: "rgba(15, 23, 42, 0.09)" },
    ],
  },
  float: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  floatBar: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 0,
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 22, color: "rgba(15, 23, 42, 0.12)" },
      { offsetX: 0, offsetY: 8, blurRadius: 24, color: "rgba(15, 23, 42, 0.16)" },
    ],
  },
  sheet: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 16,
  },
  overlay: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 24,
  },
};

/**
 * Dark mode runs far higher alpha off pure black. A slate shadow at 6% over a
 * near-black page (`#02070F`) is invisible, which is the same reason
 * `darkShadowTokens` exists for the web. Depth in dark mode still leans on the
 * hairline `borderSubtle` that dark surfaces keep.
 */
export const darkMobileElevationTokens: Record<MobileElevationLevel, MobileElevation> = {
  flat: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  raised: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 1,
  },
  /**
   * Pushed harder than its light counterpart, and harder than the levels around
   * it. Dark surfaces normally lean on the `borderSubtle` hairline they keep,
   * and a page header now has none, so black at high alpha is the only thing
   * left to darken the content passing under the bar.
   */
  header: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 4,
  },
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 2,
  },
  float: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 6,
  },
  floatBar: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 26,
    elevation: 0,
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 24, color: "rgba(0, 0, 0, 0.5)" },
      { offsetX: 0, offsetY: 8, blurRadius: 26, color: "rgba(0, 0, 0, 0.6)" },
    ],
  },
  sheet: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 16,
  },
  overlay: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 34,
    elevation: 24,
  },
};

export function getMobileElevation(level: MobileElevationLevel, isDark: boolean): MobileElevation {
  return (isDark ? darkMobileElevationTokens : mobileElevationTokens)[level];
}

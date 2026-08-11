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
 * `elevation` is the only property Android reads here, and it has two
 * behaviours worth knowing before reaching for a level:
 *  - it paints nothing against a transparent `backgroundColor`, so never apply
 *    a level to a wrapper that has no fill;
 *  - it reorders siblings in z, so a raised view can jump above a later
 *    sibling that was previously drawn on top.
 */

export type MobileElevation = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type MobileElevationLevel =
  /** No shadow. Use to explicitly cancel an inherited level. */
  | "flat"
  /** Hairline lift: sticky headers once the content scrolls under them. */
  | "raised"
  /** The default surface treatment for cards and list tiles. */
  | "card"
  /** Detached surfaces: floating tab bar, FAB-like controls, popovers. */
  | "float"
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
  raised: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  float: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
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

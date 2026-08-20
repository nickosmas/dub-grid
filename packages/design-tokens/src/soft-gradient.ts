/**
 * Soft gradient washes.
 *
 * Distinct from `heroGradientTokens`, which is a saturated card *fill* — a
 * self-contained blue block you read as an object. These are washes: every one
 * of them resolves to a colour the page already has (the background, the card's
 * own surface, or full transparency), so they add depth without adding a shape.
 * That dissolve is what makes them read as soft, and it is also what makes one
 * set of values work in both themes.
 *
 * Rule of thumb: a wash is a focal device. Put one behind a first-run screen or
 * a hero card, not on every card in a list.
 */

export type SoftGradientStops = readonly [string, string, string];

export type SoftGradientKind =
  /** Page-level wash, brand-tinted at the top, dissolving into `background`. */
  | "brandWash"
  /** Top-anchored brand halo that fades to fully transparent. Layers over anything. */
  | "aurora"
  /** Card-level sheen, dissolving into `surface`. */
  | "surfaceSheen";

export const softGradientTokens = {
  /** Final stop is exactly `lightColorTokens.background`. */
  brandWashLight: ["#F1F6FF", "#F5F8FD", "#F8FAFC"] as SoftGradientStops,
  /** Final stop is exactly `darkColorTokens.background`. */
  brandWashDark: ["#0C1424", "#060C16", "#02070F"] as SoftGradientStops,

  /** Derived from `lightColorTokens.brand` (#2563EB), fading to transparent. */
  auroraLight: [
    "rgba(37,99,235,0.14)",
    "rgba(37,99,235,0.05)",
    "rgba(37,99,235,0.00)",
  ] as SoftGradientStops,
  /** Derived from `darkColorTokens.brand` (#2075FF). Runs hotter: a dark page eats colour. */
  auroraDark: [
    "rgba(32,117,255,0.22)",
    "rgba(32,117,255,0.08)",
    "rgba(32,117,255,0.00)",
  ] as SoftGradientStops,

  /** Final stop is exactly `lightColorTokens.surface`, leaning slate on the way. */
  surfaceSheenLight: ["#F4F8FC", "#FBFCFE", "#FFFFFF"] as SoftGradientStops,
  /** Final stop is exactly `darkColorTokens.surface`. */
  surfaceSheenDark: ["#1A1A1D", "#151517", "#121214"] as SoftGradientStops,

  /**
   * Front-loaded so the colour concentrates in the first half and the tail is
   * mostly the resolved base colour.
   */
  locations: [0, 0.45, 1] as readonly [number, number, number],

  /** A shallow diagonal, deliberately flatter than the hero's corner-to-corner. */
  start: { x: 0.15, y: 0 },
  end: { x: 0.85, y: 1 },
} as const;

export function getSoftGradientStops(kind: SoftGradientKind, isDark: boolean): SoftGradientStops {
  switch (kind) {
    case "aurora":
      return isDark ? softGradientTokens.auroraDark : softGradientTokens.auroraLight;
    case "surfaceSheen":
      return isDark ? softGradientTokens.surfaceSheenDark : softGradientTokens.surfaceSheenLight;
    case "brandWash":
    default:
      return isDark ? softGradientTokens.brandWashDark : softGradientTokens.brandWashLight;
  }
}

/** CSS `linear-gradient(...)` form, so the web can render the same wash. */
export function getSoftGradientCss(kind: SoftGradientKind, isDark: boolean): string {
  const stops = getSoftGradientStops(kind, isDark);
  const parts = stops.map(
    (stop, index) => `${stop} ${Math.round(softGradientTokens.locations[index] * 100)}%`,
  );

  return `linear-gradient(to bottom right, ${parts.join(", ")})`;
}

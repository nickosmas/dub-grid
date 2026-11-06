/**
 * Home's alphas, front-loaded and running out to clear: the brand aurora's
 * shape (0.14 / 0.22 at the top) run about 1.6 times stronger, so the wash
 * reads as colour behind Home's cards (owner, 2026-11-04: more vibrant). The
 * sign-in and onboarding aurora keep the token's own.
 */
const LIGHT_ALPHAS = [0.22, 0.08, 0] as const;
const DARK_ALPHAS = [0.34, 0.13, 0] as const;

/** The brand blues the aurora is drawn from, light and dark. */
const BRAND_HUES = { light: "#2563EB", dark: "#2075FF" } as const;

/**
 * Wash hues for the two states that need a hand, one step deeper down each
 * Tailwind ramp than the semantic tokens the badges use. At the aurora's
 * alphas the badge red (#EF4444) lightened to pink over both grounds;
 * red-700 in light and red-600 in dark stay red, and amber takes the same
 * step so the two read as one family. Normal has no hue of its own: it is
 * the brand aurora, the same wash the login page and the staff home carry.
 */
const WASH_HUES = {
  light: { close: "#D97706", behind: "#B91C1C" },
  dark: { close: "#F59E0B", behind: "#DC2626" },
} as const;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Same thresholds as `coverageColor`: amber when close, red when behind. */
function washHue(pct: number, isDark: boolean): string | null {
  if (pct >= 90) return null;
  const hues = isDark ? WASH_HUES.dark : WASH_HUES.light;
  return pct >= 70 ? hues.close : hues.behind;
}

/**
 * Home's wash. Normal coverage is the brand blue, for "nothing to see";
 * below that, one status hue at the same three alphas, so it fades to clear
 * the same way. Unconfigured coverage has nothing to warn about either, and
 * the staff Home has no coverage, so both take the blue.
 */
export function buildCoverageWash(
  pct: number | null,
  isDark: boolean,
): readonly [string, string, string] {
  const hex =
    (pct == null ? null : washHue(pct, isDark)) ?? (isDark ? BRAND_HUES.dark : BRAND_HUES.light);
  const alphas = isDark ? DARK_ALPHAS : LIGHT_ALPHAS;
  return [withAlpha(hex, alphas[0]), withAlpha(hex, alphas[1]), withAlpha(hex, alphas[2])];
}

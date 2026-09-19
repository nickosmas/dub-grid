import { mobileSoftGradientStops } from "../../../shared/theme/tokens";

/** The aurora's own alphas, front-loaded and running out to clear. */
const LIGHT_ALPHAS = [0.14, 0.05, 0] as const;
const DARK_ALPHAS = [0.22, 0.08, 0] as const;

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
 * The dashboard's wash. Normal coverage is the brand aurora itself, blue for
 * "nothing to see"; below that, one status hue at the aurora's three alphas,
 * so it fades to clear exactly the way the brand halo does. Null when
 * coverage is not configured: nothing to say, so a plain page.
 */
export function buildCoverageWash(
  pct: number | null,
  isDark: boolean,
): readonly [string, string, string] | null {
  if (pct == null) return null;
  const hex = washHue(pct, isDark);
  if (hex == null) return mobileSoftGradientStops("aurora", isDark);
  const alphas = isDark ? DARK_ALPHAS : LIGHT_ALPHAS;
  return [withAlpha(hex, alphas[0]), withAlpha(hex, alphas[1]), withAlpha(hex, alphas[2])];
}

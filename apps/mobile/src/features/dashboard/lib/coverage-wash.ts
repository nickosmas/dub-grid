/** The aurora's own alphas, front-loaded and running out to clear. */
const LIGHT_ALPHAS = [0.14, 0.05, 0] as const;
const DARK_ALPHAS = [0.22, 0.08, 0] as const;

/**
 * Wash hues, one step deeper down each Tailwind ramp than the semantic
 * tokens the badges use. At the aurora's alphas the badge red (#EF4444)
 * lightened to pink over both grounds; red-700 in light and red-600 in dark
 * stay red, and green and amber take the same step so the three read as
 * one family.
 */
const WASH_HUES = {
  light: { good: "#15803D", close: "#D97706", behind: "#B91C1C" },
  dark: { good: "#16A34A", close: "#F59E0B", behind: "#DC2626" },
} as const;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Same thresholds as `coverageColor`: green ahead, amber close, red behind. */
function washHue(pct: number, isDark: boolean): string {
  const hues = isDark ? WASH_HUES.dark : WASH_HUES.light;
  if (pct >= 90) return hues.good;
  if (pct >= 70) return hues.close;
  return hues.behind;
}

/**
 * The dashboard's wash: the login page's aurora, recoloured by coverage. One
 * hue at the aurora's three alphas, so it fades to clear exactly the way the
 * brand halo does. Null when coverage is not configured: nothing to say, so
 * a plain page.
 */
export function buildCoverageWash(
  pct: number | null,
  isDark: boolean,
): [string, string, string] | null {
  if (pct == null) return null;
  const hex = washHue(pct, isDark);
  const alphas = isDark ? DARK_ALPHAS : LIGHT_ALPHAS;
  return [withAlpha(hex, alphas[0]), withAlpha(hex, alphas[1]), withAlpha(hex, alphas[2])];
}

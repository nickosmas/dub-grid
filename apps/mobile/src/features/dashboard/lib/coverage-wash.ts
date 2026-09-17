import type { MobileColors } from "../../../shared/theme/tokens";
import { coverageColor } from "./coverage";

/** The aurora's own alphas, front-loaded and running out to clear. */
const LIGHT_ALPHAS = [0.14, 0.05, 0] as const;
const DARK_ALPHAS = [0.22, 0.08, 0] as const;

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The dashboard's wash: the login page's aurora, recoloured by coverage. One
 * hue (green ahead, amber close, red behind, by the shared thresholds) at
 * the aurora's three alphas, so it fades to clear exactly the way the brand
 * halo does. Null when coverage is not configured: nothing to say, so a
 * plain page.
 */
export function buildCoverageWash(
  pct: number | null,
  mobileColors: MobileColors,
  isDark: boolean,
): [string, string, string] | null {
  if (pct == null) return null;
  const hex = coverageColor(mobileColors, pct);
  const alphas = isDark ? DARK_ALPHAS : LIGHT_ALPHAS;
  return [withAlpha(hex, alphas[0]), withAlpha(hex, alphas[1]), withAlpha(hex, alphas[2])];
}

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

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Home's wash: always the brand blue, on the staff and admin Home alike. It
 * no longer turns amber or red with coverage (owner, 2026-11-12); Home's
 * coverage figure and its badge carry that.
 */
export function buildHomeWash(isDark: boolean): readonly [string, string, string] {
  const hex = isDark ? BRAND_HUES.dark : BRAND_HUES.light;
  const alphas = isDark ? DARK_ALPHAS : LIGHT_ALPHAS;
  return [withAlpha(hex, alphas[0]), withAlpha(hex, alphas[1]), withAlpha(hex, alphas[2])];
}

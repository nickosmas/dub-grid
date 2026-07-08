/**
 * Tokens for the animated dubgrid mark. Shared by web (SVG <rect>) and
 * mobile (RN <View>) so the splash logo pulses at the same size and rhythm
 * envelope on every surface. Per-cell timings are generated randomly at
 * mount time inside each app's component — these bounds define the range.
 */

export const BRAND_ANIMATED_LOGO_SIZE = 96;

// Opacity floor sits at the static mark's "faint" value (0.3) — pulse reads
// as a smooth breath rather than a blink (no near-zero dip).
export const ANIMATED_LOGO_OPACITY_MIN = 0.3;
export const ANIMATED_LOGO_OPACITY_MAX = 1;

// Per-cell pulse duration range (seconds). Short cycles → fast, snappy feel.
export const ANIMATED_LOGO_DURATION_MIN_S = 0.6;
export const ANIMATED_LOGO_DURATION_MAX_S = 1.4;

// Per-cell start-delay range (seconds). Min is always 0. Tight bound so every
// cell is in motion within the first second — no slow ramp-up.
export const ANIMATED_LOGO_DELAY_MAX_S = 0.6;

export type AnimatedLogoTiming = readonly [duration: number, delay: number];

export function generateAnimatedLogoTimings(): readonly AnimatedLogoTiming[] {
  const durationSpan = ANIMATED_LOGO_DURATION_MAX_S - ANIMATED_LOGO_DURATION_MIN_S;
  return Array.from(
    { length: 16 },
    () =>
      [
        ANIMATED_LOGO_DURATION_MIN_S + Math.random() * durationSpan,
        Math.random() * ANIMATED_LOGO_DELAY_MAX_S,
      ] as const,
  );
}

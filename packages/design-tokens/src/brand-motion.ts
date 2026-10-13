/**
 * The two-card logo's loading animations as pure functions of time, so web
 * and mobile draw the same frames and tests can pin them. The logo is static
 * everywhere else; these play only on full-screen waits. Each returns the
 * cards to draw back to front, in the symbol's 100-unit box.
 */
import { BRAND_MARK_BACK, BRAND_MARK_FRONT, type BrandMarkCard } from "./brand-mark";

export interface BrandMotionCard {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly radius: number;
  readonly scale: number;
  readonly opacity: number;
  /** 0 draws the back card's outline, 1 the solid front card with its gap. */
  readonly solid: number;
  /** Draws only part of the outline: `length` of it, starting `offset` along. */
  readonly trace?: { readonly length: number; readonly offset: number };
}

export type BrandMotionFrame = readonly BrandMotionCard[];

/** Card height over width; both cards are 4:3. */
export const BRAND_MOTION_ASPECT = 0.75;

interface Pose {
  cx: number;
  cy: number;
  width: number;
  radius: number;
}

const pose = ({ x, y, width, height, radius }: BrandMarkCard): Pose => ({
  cx: x + width / 2,
  cy: y + height / 2,
  width,
  radius,
});
const BACK = pose(BRAND_MARK_BACK);
const FRONT = pose(BRAND_MARK_FRONT);

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const between = (a: Pose, b: Pose, k: number): Pose => ({
  cx: lerp(a.cx, b.cx, k),
  cy: lerp(a.cy, b.cy, k),
  width: lerp(a.width, b.width, k),
  radius: lerp(a.radius, b.radius, k),
});
const quartInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2);
const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const card = (at: Pose, overrides: Partial<BrandMotionCard> = {}): BrandMotionCard => ({
  ...at,
  scale: 1,
  opacity: 1,
  solid: 0,
  ...overrides,
});
const back = (overrides?: Partial<BrandMotionCard>) => card(BACK, overrides);
const front = (overrides?: Partial<BrandMotionCard>) => card(FRONT, { solid: 1, ...overrides });

/** The static mark, which reduced motion shows. */
export const brandRestFrame = (): BrandMotionFrame => [back(), front()];

/** Loop length of each animation, in seconds. */
export const BRAND_MOTION_DURATION = { breathe: 2.4, shuffle: 1.8, trace: 1.4 } as const;

export type BrandAnimation = keyof typeof BRAND_MOTION_DURATION;

const loopTime = (name: BrandAnimation, t: number) => {
  const duration = BRAND_MOTION_DURATION[name];
  return ((t % duration) + duration) % duration;
};

/** Slow pulse; starts on the static mark so a launch image hands off cleanly. */
export function brandBreathe(t: number): BrandMotionFrame {
  const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * loopTime("breathe", t)) / 2.4);
  return [back({ cx: BACK.cx - 4 * u }), front({ scale: 1 + 0.045 * u })];
}

/**
 * The cards trade places along one arc in 1 s, then rest. Each switches
 * between outline and solid only between 30% and 70% of the move, so neither
 * reads as see-through for long.
 */
export function brandShuffle(t: number): BrandMotionFrame {
  const u = clamp(loopTime("shuffle", t));
  const angle = Math.PI * quartInOut(u);
  const swapped = smoothstep(0.3, 0.7, u);
  return [0, Math.PI]
    .map((start) => {
      const a = angle + start;
      const k = (1 - Math.cos(a)) / 2;
      return card(
        { ...between(FRONT, BACK, k), cy: 50 - 8 * Math.sin(a) },
        { solid: start === 0 ? 1 - swapped : swapped },
      );
    })
    .sort((a, b) => a.solid - b.solid);
}

/** A segment a third of the outline long runs around the back card. */
export function brandTrace(t: number): BrandMotionFrame {
  return [
    back({ opacity: 0.28 }),
    back({ trace: { length: 0.32, offset: loopTime("trace", t) / 1.4 } }),
    front(),
  ];
}

export const brandMotionFrames: Record<BrandAnimation, (t: number) => BrandMotionFrame> = {
  breathe: brandBreathe,
  shuffle: brandShuffle,
  trace: brandTrace,
};

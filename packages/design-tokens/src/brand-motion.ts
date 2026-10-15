/**
 * The stacked logo's loading animations as pure functions of time, so web
 * and mobile draw the same frames and tests can pin them. The logo is static
 * everywhere else; these play only on full-screen waits. Spec:
 * `blueprint/reference/stack-logo-animations.md`.
 */
import {
  BRAND_SYMBOL_BACK,
  BRAND_SYMBOL_CARD,
  BRAND_SYMBOL_FRONT,
  BRAND_SYMBOL_INK,
} from "./brand-mark";

export interface BrandMotionCard {
  /** Center in the symbol's ink box. */
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly opacity: number;
  /** 0 is the back card's color, 1 the front card's. */
  readonly color: number;
}

export interface BrandMotionFrame {
  /** Back to front. Each card cuts the gap out of the cards behind it. */
  readonly cards: readonly BrandMotionCard[];
  /** Share of the gap drawn: 1 is the static mark's. */
  readonly gap: number;
}

/** Loop length of each animation, in seconds. */
export const BRAND_MOTION_DURATION = { breathe: 2.4, shuffle: 1.8, climb: 1.6 } as const;

/** How long the move takes in each Shuffle and Climb cycle; the rest of the cycle rests. */
export const BRAND_MOTION_MOVE = { shuffle: 1.0, climb: 1.0 } as const;

export type BrandAnimation = keyof typeof BRAND_MOTION_DURATION;
export type BrandSteppedAnimation = keyof typeof BRAND_MOTION_MOVE;

/** A card fades only below this share of its size, when it overlaps no other. */
export const BRAND_MOTION_FADE_BELOW = 0.3;

type Vec = { readonly x: number; readonly y: number };

const BACK: Vec = { x: BRAND_SYMBOL_BACK.cx, y: BRAND_SYMBOL_BACK.cy };
const FRONT: Vec = { x: BRAND_SYMBOL_FRONT.cx, y: BRAND_SYMBOL_FRONT.cy };
const STEP: Vec = { x: FRONT.x - BACK.x, y: FRONT.y - BACK.y };
const STEP_LENGTH = Math.hypot(STEP.x, STEP.y);
const ALONG: Vec = { x: STEP.x / STEP_LENGTH, y: STEP.y / STEP_LENGTH };
// Perpendicular to the stack, up and to the left: "over the top".
const OVER: Vec = { x: ALONG.y, y: -ALONG.x };
// The outline-mark motion was specified in a 100-unit box around 94 units of
// ink; distances keep the same share of the symbol.
const UNIT = Math.max(BRAND_SYMBOL_INK.width, BRAND_SYMBOL_INK.height) / 94;

const tan = Math.tan((BRAND_SYMBOL_CARD.slantDeg * Math.PI) / 180);
const halfW = BRAND_SYMBOL_CARD.width / 2;
const halfH = BRAND_SYMBOL_CARD.height / 2;
// Corners the climbing cards scale from, relative to a card's center.
const TOP_RIGHT: Vec = { x: halfW, y: -halfH + halfW * tan };
const BOTTOM_LEFT: Vec = { x: -halfW, y: halfH - halfW * tan };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const quartInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2);
const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const window01 = (u: number, from: number, to: number) => clamp((u - from) / (to - from));

const card = (at: Vec, color: number, scale = 1, opacity = 1): BrandMotionCard => ({
  cx: at.x,
  cy: at.y,
  scale,
  opacity,
  color,
});

/** The static mark, which reduced motion shows. */
export const brandRestFrame = (): BrandMotionFrame => ({
  cards: [card(BACK, 0), card(FRONT, 1)],
  gap: 1,
});

const loopTime = (name: BrandAnimation, t: number) => {
  const duration = BRAND_MOTION_DURATION[name];
  return ((t % duration) + duration) % duration;
};

/**
 * A slow sine loop: the front card grows 4.5% while the back card eases 4
 * units away along the stack. Starts on the static mark so a launch image
 * hands off without a jump.
 */
export function brandBreathe(t: number): BrandMotionFrame {
  const u =
    0.5 - 0.5 * Math.cos((2 * Math.PI * loopTime("breathe", t)) / BRAND_MOTION_DURATION.breathe);
  const away = 4 * UNIT * u;
  return {
    cards: [
      card({ x: BACK.x - away * ALONG.x, y: BACK.y - away * ALONG.y }, 0),
      card(FRONT, 1, 1 + 0.045 * u),
    ],
    gap: 1,
  };
}

/**
 * One swap at `u` from 0 to 1 of the move: the cards trade places along one
 * arc with 8 units of lift across the stack. Their colors cross between 30%
 * and 70% of the move, and the gap closes while they pass, so the change of
 * which card is cut never shows.
 */
export function brandShuffleMove(u: number): BrandMotionFrame {
  const angle = Math.PI * quartInOut(clamp(u));
  const crossed = smoothstep(0.3, 0.7, u);
  const lift = 8 * UNIT;
  const cards = [0, Math.PI].map((start) => {
    const a = angle + start;
    const k = (1 - Math.cos(a)) / 2;
    return card(
      {
        x: lerp(FRONT.x, BACK.x, k) + OVER.x * lift * Math.sin(a),
        y: lerp(FRONT.y, BACK.y, k) + OVER.y * lift * Math.sin(a),
      },
      start === 0 ? 1 - crossed : crossed,
    );
  });
  cards.sort((a, b) => a.color - b.color);
  return { cards, gap: smoothstep(0.08, 0.2, Math.abs(u - 0.5)) };
}

const scaledFrom = (at: Vec, corner: Vec, scale: number): Vec => ({
  x: at.x + corner.x * (1 - scale),
  y: at.y + corner.y * (1 - scale),
});
const DRIFT = 0.35;
const along = (at: Vec, k: number): Vec => ({
  x: at.x + DRIFT * STEP.x * k,
  y: at.y + DRIFT * STEP.y * k,
});
const fade = (scale: number) => smoothstep(0, BRAND_MOTION_FADE_BELOW, scale);

/**
 * One step at `u` from 0 to 1 of the move, rippling up the stack front to
 * back: the front card steps forward and shrinks into its top-right corner,
 * the back card rises into its place and takes the front's color, and a new
 * back card grows out of its bottom-left corner. The leaving and arriving
 * cards mirror each other, so the step is symmetric under a half turn and
 * time reversal, like the mark.
 */
export function brandClimbMove(u: number): BrandMotionFrame {
  const leaving = smoothstep(0, 1, window01(u, 0, 0.8));
  const rise = quartInOut(window01(u, 0.1, 0.9));
  const arriving = smoothstep(0, 1, window01(u, 0.2, 1));
  const cards = [
    card(scaledFrom(along(BACK, arriving - 1), BOTTOM_LEFT, arriving), 0, arriving, fade(arriving)),
    card({ x: lerp(BACK.x, FRONT.x, rise), y: lerp(BACK.y, FRONT.y, rise) }, rise),
    card(
      scaledFrom(along(FRONT, leaving), TOP_RIGHT, 1 - leaving),
      1,
      1 - leaving,
      fade(1 - leaving),
    ),
  ].filter((c) => c.scale > 0.01);
  return { cards, gap: 1 };
}

const MOVES: Record<BrandSteppedAnimation, (u: number) => BrandMotionFrame> = {
  shuffle: brandShuffleMove,
  climb: brandClimbMove,
};

const steppedLoop = (name: BrandSteppedAnimation) => (t: number) =>
  MOVES[name](Math.min(1, loopTime(name, t) / BRAND_MOTION_MOVE[name]));

export const brandShuffle = steppedLoop("shuffle");
export const brandClimb = steppedLoop("climb");

export const brandMotionFrames: Record<BrandAnimation, (t: number) => BrandMotionFrame> = {
  breathe: brandBreathe,
  shuffle: brandShuffle,
  climb: brandClimb,
};

/**
 * Shuffle or Climb at `t` seconds when the wait ended at `stoppedAt`: it
 * finishes the move in progress, then rests on the static mark. `done` turns
 * true once the mark is at rest, so the caller can unmount it.
 */
export function brandSettlingFrame(
  name: BrandSteppedAnimation,
  t: number,
  stoppedAt: number,
): { readonly frame: BrandMotionFrame; readonly done: boolean } {
  const cycle = BRAND_MOTION_DURATION[name];
  const cycleStart = Math.floor(stoppedAt / cycle) * cycle;
  const u = (t - cycleStart) / BRAND_MOTION_MOVE[name];
  if (u >= 1) return { frame: brandRestFrame(), done: true };
  return { frame: MOVES[name](u), done: false };
}

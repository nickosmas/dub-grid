/**
 * The stacked logo's loading animations as pure functions of time, so web
 * and mobile draw the same frames and tests can pin them. The logo is static
 * everywhere else; these play only on full-screen waits. Spec:
 * `blueprint/reference/stack-logo-animations.md`.
 */
import { BRAND_SYMBOL_CARD, BRAND_SYMBOL_CARDS } from "./brand-mark";

export interface BrandMotionCard {
  /** Center in the symbol's ink box. */
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly opacity: number;
  /** 0 is the side cards' color, 1 the center card's. */
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

const [BACK, CENTER, FRONT] = BRAND_SYMBOL_CARDS;
const SIDE = BACK.scale;
const STEP: Vec = { x: FRONT.cx - CENTER.cx, y: FRONT.cy - CENTER.cy };
const STEP_LENGTH = Math.hypot(STEP.x, STEP.y);
const ALONG: Vec = { x: STEP.x / STEP_LENGTH, y: STEP.y / STEP_LENGTH };
// Perpendicular to the stack, up and to the left: "over the top".
const OVER: Vec = { x: ALONG.y, y: -ALONG.x };

const tan = Math.tan((BRAND_SYMBOL_CARD.slantDeg * Math.PI) / 180);
const halfW = BRAND_SYMBOL_CARD.width / 2;
const halfH = BRAND_SYMBOL_CARD.height / 2;
// Corners a leaving or arriving card shrinks into, relative to a full-size card's center.
const TOP_RIGHT: Vec = { x: halfW, y: -halfH + halfW * tan };
const BOTTOM_LEFT: Vec = { x: -halfW, y: halfH - halfW * tan };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const quartInOut = (x: number) => {
  const t = clamp(x);
  return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
};
const smoothstep = (from: number, to: number, x: number) => {
  const t = clamp((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const window01 = (u: number, from: number, to: number) => clamp((u - from) / (to - from));

// A card at slot `s` along the stack: -1 back, 0 center, 1 front. Size and
// color follow the slot, so a moving card takes on the look of where it lands.
const slotAt = (s: number): Vec => ({ x: CENTER.cx + STEP.x * s, y: CENTER.cy + STEP.y * s });
const scaleAt = (s: number) => 1 - (1 - SIDE) * Math.min(1, Math.abs(s));
const colorAt = (s: number) => 1 - Math.min(1, Math.abs(s));

const card = (at: Vec, color: number, scale: number, opacity = 1): BrandMotionCard => ({
  cx: at.x,
  cy: at.y,
  scale,
  opacity,
  color,
});
const slotCard = (s: number, color = colorAt(s)) => card(slotAt(s), color, scaleAt(s));

/** The static mark, which reduced motion shows. */
export const brandRestFrame = (): BrandMotionFrame => ({
  cards: [slotCard(-1), slotCard(0), slotCard(1)],
  gap: 1,
});

const loopTime = (name: BrandAnimation, t: number) => {
  const duration = BRAND_MOTION_DURATION[name];
  return ((t % duration) + duration) % duration;
};

/**
 * A slow sine loop: the center card grows 4.5% while the back and front
 * cards ease 4 units away from it along the stack. Starts on the static mark
 * so a launch image hands off without a jump.
 */
export function brandBreathe(t: number): BrandMotionFrame {
  const u =
    0.5 - 0.5 * Math.cos((2 * Math.PI * loopTime("breathe", t)) / BRAND_MOTION_DURATION.breathe);
  const away = 4 * u;
  const eased = (s: -1 | 1) => {
    const at = slotAt(s);
    return card({ x: at.x + ALONG.x * away * s, y: at.y + ALONG.y * away * s }, 0, SIDE);
  };
  return { cards: [eased(-1), card(slotAt(0), 1, 1 + 0.045 * u), eased(1)], gap: 1 };
}

/**
 * One shuffle at `u` from 0 to 1 of the move: the back and center cards step
 * forward one place while the front card arcs over the top to the back. The
 * colors cross between 30% and 70% of the move, and the gaps close while the
 * front card passes over the stack, so the change of which card is cut never
 * shows.
 */
export function brandShuffleMove(u: number): BrandMotionFrame {
  const e = quartInOut(u);
  const crossed = smoothstep(0.3, 0.7, u);
  const s = 1 - 2 * e;
  const lift = Math.sin(Math.PI * e) * 60;
  const at = slotAt(s);
  const passing = card({ x: at.x + OVER.x * lift, y: at.y + OVER.y * lift }, 0, SIDE);
  const stepping = [slotCard(-1 + e, crossed), slotCard(e, 1 - crossed)];
  const cards = e < 0.5 ? [...stepping, passing] : [passing, ...stepping];
  const gap = 1 - smoothstep(0.38, 0.46, u) + smoothstep(0.54, 0.62, u);
  return { cards, gap: Math.min(1, gap) };
}

const DRIFT = 0.35;

// A card leaving past the front (`s` > 1) or arriving from behind (`s` < -1)
// keeps its outer corner fixed while it shrinks or grows, and fades only below
// `BRAND_MOTION_FADE_BELOW` of a side card's size.
function edgeCard(s: number): BrandMotionCard {
  const beyond = clamp((Math.abs(s) - 1) / DRIFT);
  const scale = SIDE * (1 - beyond);
  const anchor = slotAt(Math.sign(s) * Math.min(Math.abs(s), 1 + DRIFT));
  const corner = s > 0 ? TOP_RIGHT : BOTTOM_LEFT;
  return card(
    { x: anchor.x + corner.x * (SIDE - scale), y: anchor.y + corner.y * (SIDE - scale) },
    0,
    scale,
    clamp(scale / SIDE / BRAND_MOTION_FADE_BELOW),
  );
}

/**
 * One step at `u` from 0 to 1 of the move, rippling from the front card
 * back: the front card steps forward and shrinks into its top-right corner,
 * the center and back cards each rise one place and take on its look, and a
 * new back card grows out of its bottom-left corner. The leaving and arriving
 * cards mirror each other, so the step is symmetric under a half turn and
 * time reversal, like the mark.
 */
export function brandClimbMove(u: number): BrandMotionFrame {
  const front = smoothstep(0, 1, window01(u, 0, 0.75));
  const center = quartInOut(window01(u, 0.08, 0.83));
  const back = quartInOut(window01(u, 0.16, 0.91));
  const arrive = smoothstep(0, 1, window01(u, 0.25, 1));
  const leaving = front < 1e-6 ? slotCard(1) : edgeCard(1 + DRIFT * front);
  const cards = [
    edgeCard(-1 - DRIFT * (1 - arrive)),
    slotCard(-1 + back),
    slotCard(center),
    leaving,
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

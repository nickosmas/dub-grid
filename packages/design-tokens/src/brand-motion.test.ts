import { describe, expect, it } from "vitest";
import {
  BRAND_MOTION_DURATION,
  BRAND_MOTION_FADE_BELOW,
  BRAND_MOTION_MOVE,
  brandBreathe,
  brandClimb,
  brandClimbMove,
  brandMotionFrames,
  brandRestFrame,
  brandSettlingFrame,
  brandShuffle,
  brandShuffleMove,
  type BrandMotionFrame,
} from "./brand-motion";
import { BRAND_SYMBOL_INK } from "./brand-mark";

const rounded = (frame: BrandMotionFrame) => ({
  gap: +frame.gap.toFixed(3),
  cards: frame.cards.map((c) => ({
    cx: +c.cx.toFixed(3),
    cy: +c.cy.toFixed(3),
    scale: +c.scale.toFixed(3),
    opacity: +c.opacity.toFixed(3),
    color: +c.color.toFixed(3),
  })),
});
const rest = rounded(brandRestFrame());
const samples = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

describe("brand motion", () => {
  it("starts every animation on the static mark", () => {
    for (const frames of Object.values(brandMotionFrames)) {
      expect(rounded(frames(0))).toEqual(rest);
    }
  });

  it("loops Breathe on the static mark and peaks with the center card 4.5% larger", () => {
    expect(rounded(brandBreathe(BRAND_MOTION_DURATION.breathe))).toEqual(rest);
    const [back, center, front] = brandBreathe(BRAND_MOTION_DURATION.breathe / 2).cards;
    expect(center.scale).toBeCloseTo(1.045, 6);
    const [restBack, , restFront] = brandRestFrame().cards;
    // The side cards ease away from the center along the stack.
    expect(back.cx).toBeLessThan(restBack.cx);
    expect(back.cy).toBeGreaterThan(restBack.cy);
    expect(front.cx).toBeGreaterThan(restFront.cx);
    expect(front.cy).toBeLessThan(restFront.cy);
  });

  it("rests on three cards with the strongest color in the center", () => {
    expect(brandRestFrame().cards.map((c) => [c.scale, c.color])).toEqual([
      [0.75, 0],
      [1, 1],
      [0.75, 0],
    ]);
  });

  it("ends each Shuffle and Climb move on the static mark and rests there until the next", () => {
    for (const [name, frames] of [
      ["shuffle", brandShuffle],
      ["climb", brandClimb],
    ] as const) {
      expect(rounded(frames(BRAND_MOTION_MOVE[name]))).toEqual(rest);
      expect(rounded(frames((BRAND_MOTION_MOVE[name] + BRAND_MOTION_DURATION[name]) / 2))).toEqual(
        rest,
      );
      expect(rounded(frames(BRAND_MOTION_DURATION[name]))).toEqual(rest);
    }
  });

  it("crosses Shuffle's colors only between 30% and 70% of the move", () => {
    // The card stepping from the back to the center, and the one leaving it.
    const colors = (u: number) => {
      const cards = brandShuffleMove(u).cards;
      const stepping = u < 0.5 ? cards.slice(0, 2) : cards.slice(1);
      return stepping.map((c) => c.color);
    };
    for (const u of [0, 0.15, 0.3]) expect(colors(u).map((c) => +c.toFixed(6))).toEqual([0, 1]);
    for (const u of [0.7, 0.85, 1]) expect(colors(u).map((c) => +c.toFixed(6))).toEqual([1, 0]);
    for (const c of colors(0.5)) expect(c).toBeCloseTo(0.5, 6);
  });

  it("closes Shuffle's gaps while the front card passes over the stack", () => {
    expect(brandShuffleMove(0.5).gap).toBe(0);
    expect(brandShuffleMove(0.46).gap).toBeCloseTo(0, 6);
    expect(brandShuffleMove(0.38).gap).toBeCloseTo(1, 6);
    expect(brandShuffleMove(0.62).gap).toBeCloseTo(1, 6);
  });

  it("carries Shuffle's front card over the top to the back", () => {
    const start = brandShuffleMove(0).cards;
    const mid = brandShuffleMove(0.5).cards;
    const end = brandShuffleMove(1).cards;
    const passing = mid.find((c) => c.scale === 0.75 && c.color === 0);
    expect(passing).toBeDefined();
    // Up and to the left of the line through the stack.
    const [restBack, , restFront] = brandRestFrame().cards;
    const cross =
      (restFront.cx - restBack.cx) * (passing!.cy - restBack.cy) -
      (restFront.cy - restBack.cy) * (passing!.cx - restBack.cx);
    expect(cross).toBeLessThan(0);
    expect(rounded({ cards: [end[0]], gap: 1 })).toEqual(
      rounded({ cards: [brandRestFrame().cards[0]], gap: 1 }),
    );
    expect(start[2].color).toBe(0);
  });

  it("mirrors Climb's arriving card with its leaving card under a half turn and time reversal", () => {
    const { width, height } = BRAND_SYMBOL_INK;
    const isEdge = (c: { scale: number }) => c.scale < 0.75 - 1e-9;
    for (const u of samples(20)) {
      const now = brandClimbMove(u).cards;
      const mirror = brandClimbMove(1 - u).cards;
      const arriving = isEdge(now[0]) ? now[0] : undefined;
      const last = mirror[mirror.length - 1];
      const leaving = isEdge(last) ? last : undefined;
      expect(Boolean(arriving)).toBe(Boolean(leaving));
      if (!arriving || !leaving) continue;
      expect(arriving.scale).toBeCloseTo(leaving.scale, 6);
      expect(arriving.opacity).toBeCloseTo(leaving.opacity, 6);
      expect(arriving.cx).toBeCloseTo(width - leaving.cx, 6);
      expect(arriving.cy).toBeCloseTo(height - leaving.cy, 6);
    }
  });

  it("never shows a card below the fade threshold at full opacity, or a larger one see-through", () => {
    for (const u of samples(200)) {
      for (const c of [...brandClimbMove(u).cards, ...brandShuffleMove(u).cards]) {
        if (c.scale < BRAND_MOTION_FADE_BELOW * 0.75) expect(c.opacity).toBeLessThan(1);
        else expect(c.opacity).toBe(1);
      }
    }
  });

  it("finishes the move in progress when the wait ends, then rests", () => {
    const stoppedAt = BRAND_MOTION_DURATION.climb + 0.4;
    const mid = brandSettlingFrame("climb", stoppedAt + 0.2, stoppedAt);
    expect(mid.done).toBe(false);
    expect(rounded(mid.frame)).toEqual(rounded(brandClimbMove(0.6)));
    const end = brandSettlingFrame("climb", BRAND_MOTION_DURATION.climb + 1, stoppedAt);
    expect(end.done).toBe(true);
    expect(rounded(end.frame)).toEqual(rest);
    // Stopped while resting between moves: at rest at once.
    expect(brandSettlingFrame("shuffle", 1.5, 1.5).done).toBe(true);
  });

  it("exposes a frame function for every timed animation", () => {
    expect(Object.keys(brandMotionFrames).sort()).toEqual(
      Object.keys(BRAND_MOTION_DURATION).sort(),
    );
  });
});

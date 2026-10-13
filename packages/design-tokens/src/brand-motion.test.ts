import { describe, expect, it } from "vitest";
import {
  BRAND_MOTION_DURATION,
  brandBreathe,
  brandMotionFrames,
  brandRestFrame,
  brandShuffle,
  brandTrace,
  type BrandMotionFrame,
} from "./brand-motion";

const rounded = (frame: BrandMotionFrame) =>
  frame.map((c) => ({
    cx: +c.cx.toFixed(3),
    cy: +c.cy.toFixed(3),
    width: +c.width.toFixed(3),
    radius: +c.radius.toFixed(3),
    scale: +c.scale.toFixed(3),
    opacity: +c.opacity.toFixed(3),
    solid: +c.solid.toFixed(3),
    trace: c.trace,
  }));
const rest = rounded(brandRestFrame());

describe("brand motion", () => {
  it("starts and loops Breathe on the static mark, so a launch image hands off without a jump", () => {
    expect(rounded(brandBreathe(0))).toEqual(rest);
    expect(rounded(brandBreathe(BRAND_MOTION_DURATION.breathe))).toEqual(rest);
    const [, front] = brandBreathe(1.2);
    expect(front.scale).toBeCloseTo(1.045, 6);
  });

  it("rests Shuffle on the static mark before and after each swap", () => {
    expect(rounded(brandShuffle(0))).toEqual(rest);
    expect(rounded(brandShuffle(1.4))).toEqual(rest);
    expect(rounded(brandShuffle(BRAND_MOTION_DURATION.shuffle))).toEqual(rest);
  });

  it("switches Shuffle's cards between outline and solid only between 30% and 70% of the move", () => {
    const solids = (t: number) => brandShuffle(t).map((c) => c.solid);
    for (const t of [0.3, 0.7]) {
      const [outline, solid] = solids(t);
      expect(outline).toBeCloseTo(0, 6);
      expect(solid).toBeCloseTo(1, 6);
    }
    const [a, b] = solids(0.5);
    expect(a).toBeCloseTo(0.5, 6);
    expect(b).toBeCloseTo(0.5, 6);
  });

  it("swaps the cards along one arc with 8 units of lift", () => {
    const heights = brandShuffle(0.5).map((c) => c.cy);
    expect(Math.min(...heights)).toBeCloseTo(42, 6);
    expect(Math.max(...heights)).toBeCloseTo(58, 6);
  });

  it("traces a segment a third of the outline long over a faint track", () => {
    const [track, segment, front] = brandTrace(0.7);
    expect(track.opacity).toBeCloseTo(0.28, 6);
    expect(segment.trace?.length).toBeCloseTo(0.32, 6);
    expect(segment.trace?.offset).toBeCloseTo(0.5, 6);
    expect(rounded([front])).toEqual([rest[1]]);
  });

  it("exposes a frame function for every timed animation", () => {
    expect(Object.keys(brandMotionFrames).sort()).toEqual(
      Object.keys(BRAND_MOTION_DURATION).sort(),
    );
  });
});

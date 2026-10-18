import { describe, expect, it } from "vitest";
import {
  clampDragDelta,
  computeAutoScrollStep,
  computeDropIndex,
  computeSlotSize,
  computeTargetDelta,
} from "./reorder-geometry";

// Three rows of 40, 60 and 40 px with an 8 px gap between them.
const layout = { tops: [0, 48, 116], heights: [40, 60, 40] };

describe("reorder geometry", () => {
  it("drops past each item whose center the dragged center has crossed", () => {
    expect(computeDropIndex(layout, 0, 0)).toBe(0);
    // Row 0's center is at 20; row 1's at 78.
    expect(computeDropIndex(layout, 0, 57)).toBe(0);
    expect(computeDropIndex(layout, 0, 59)).toBe(1);
    expect(computeDropIndex(layout, 0, 200)).toBe(2);
    expect(computeDropIndex(layout, 2, -200)).toBe(0);
  });

  it("lands first or last when the drag is clamped at an end", () => {
    const even = { tops: [0, 48, 96], heights: [40, 40, 40] };
    expect(computeDropIndex(even, 0, clampDragDelta(even, 0, 999))).toBe(2);
    expect(computeDropIndex(even, 2, clampDragDelta(even, 2, -999))).toBe(0);
    expect(computeDropIndex(even, 1, 0)).toBe(1);
  });

  it("travels edge to edge, gaps included", () => {
    expect(computeTargetDelta(layout, 0, 0)).toBe(0);
    // Row 0 ends up bottom-aligned with where row 1 ended (108).
    expect(computeTargetDelta(layout, 0, 1)).toBe(68);
    expect(computeTargetDelta(layout, 0, 2)).toBe(116);
    expect(computeTargetDelta(layout, 2, 0)).toBe(-116);
    expect(computeTargetDelta(layout, 2, 1)).toBe(-68);
  });

  it("steps the others aside by the dragged item's height plus its gap", () => {
    expect(computeSlotSize(layout, 0)).toBe(48);
    expect(computeSlotSize(layout, 1)).toBe(68);
    expect(computeSlotSize(layout, 2)).toBe(48);
    expect(computeSlotSize({ tops: [0], heights: [30] }, 0)).toBe(30);
  });

  it("keeps the dragged item inside the list", () => {
    expect(clampDragDelta(layout, 1, -500)).toBe(-48);
    expect(clampDragDelta(layout, 1, 500)).toBe(48);
    expect(clampDragDelta(layout, 1, 10)).toBe(10);
  });

  it("scrolls only near an edge, faster the closer the pointer gets", () => {
    expect(computeAutoScrollStep(400, 0, 800)).toBe(0);
    const near = computeAutoScrollStep(790, 0, 800);
    const nudge = computeAutoScrollStep(720, 0, 800);
    expect(nudge).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(nudge);
    expect(computeAutoScrollStep(900, 0, 800)).toBe(22);
    expect(computeAutoScrollStep(5, 0, 800)).toBeLessThan(0);
    expect(computeAutoScrollStep(-50, 0, 800)).toBe(-22);
    expect(computeAutoScrollStep(10, 0, 0)).toBe(0);
  });
});

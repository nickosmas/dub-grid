import { describe, expect, it } from "vitest";
import {
  BRAND_MARK_BACK,
  BRAND_MARK_BACK_STROKE,
  BRAND_MARK_FRONT,
  BRAND_MARK_GAP,
  BRAND_MARK_INK,
  BRAND_MARK_OPTICAL_OFFSET_X,
  BRAND_MARK_SQUARE,
  brandMarkCardPath,
  getBrandLockupSymbolLayout,
  getBrandStackedLayout,
} from "./brand-mark-outline";

const box = (c: typeof BRAND_MARK_FRONT) =>
  [c.x, c.y, c.width, c.height, c.radius].map((n) => Number(n.toFixed(2)));

describe("brand mark geometry", () => {
  it("pins the two card boxes approved on 2026-10-09", () => {
    expect(box(BRAND_MARK_BACK)).toEqual([3, 25.02, 66.61, 49.96, 12.49]);
    expect(box(BRAND_MARK_FRONT)).toEqual([22.98, 22.24, 74.02, 55.51, 15.21]);
  });

  it("keeps both cards 4:3, the back card at 90%, with 30% of it showing", () => {
    for (const card of [BRAND_MARK_BACK, BRAND_MARK_FRONT]) {
      expect(card.width / card.height).toBeCloseTo(4 / 3, 10);
    }
    expect(BRAND_MARK_BACK.width / BRAND_MARK_FRONT.width).toBeCloseTo(0.9, 10);
    expect((BRAND_MARK_FRONT.x - BRAND_MARK_BACK.x) / BRAND_MARK_BACK.width).toBeCloseTo(0.3, 10);
  });

  it("crops the ink to the outline's outer edge and the front card's right edge", () => {
    expect(
      [BRAND_MARK_INK.x, BRAND_MARK_INK.y, BRAND_MARK_INK.width, BRAND_MARK_INK.height].map((n) =>
        Number(n.toFixed(2)),
      ),
    ).toEqual([0, 22.02, 97, 55.96]);
  });

  it("centers the symbol and keeps its ink inside the box", () => {
    const backOuterLeft = BRAND_MARK_BACK.x - BRAND_MARK_BACK_STROKE / 2;
    const frontRight = BRAND_MARK_FRONT.x + BRAND_MARK_FRONT.width;
    expect(backOuterLeft).toBe(0);
    expect(frontRight).toBeCloseTo(97, 10);
    expect(BRAND_MARK_FRONT.y + BRAND_MARK_FRONT.height / 2).toBe(50);
  });

  it("cuts a gap as wide as the back card's stroke", () => {
    expect(BRAND_MARK_GAP).toBe(6);
    expect(BRAND_MARK_BACK_STROKE).toBe(6);
  });
});

describe("getBrandLockupSymbolLayout", () => {
  it("makes the front card as tall as an ascender", () => {
    const { height } = getBrandLockupSymbolLayout(1000);
    expect((BRAND_MARK_FRONT.height / BRAND_MARK_INK.height) * height).toBeCloseTo(720, 6);
  });

  it("centers the symbol on the wordmark's optical center", () => {
    const { height, belowBaseline } = getBrandLockupSymbolLayout(1000);
    expect(height / 2 - belowBaseline).toBeCloseTo(256, 6);
  });

  it("starts the wordmark 230 units past the symbol's ink", () => {
    expect(getBrandLockupSymbolLayout(1000).marginRight).toBeCloseTo(230, 10);
  });

  it("scales linearly with the font size", () => {
    const a = getBrandLockupSymbolLayout(26);
    const b = getBrandLockupSymbolLayout(52);
    expect(b.width).toBeCloseTo(2 * a.width, 10);
    expect(b.belowBaseline).toBeCloseTo(2 * a.belowBaseline, 10);
  });
});

describe("BRAND_MARK_SQUARE", () => {
  it("holds the ink with clear space, shifted left so its optical center is the middle", () => {
    const { x, y, size } = BRAND_MARK_SQUARE;
    const inkCenter = BRAND_MARK_INK.x + BRAND_MARK_INK.width / 2;
    expect(x + size / 2).toBeCloseTo(inkCenter + BRAND_MARK_OPTICAL_OFFSET_X, 10);
    expect(y + size / 2).toBeCloseTo(BRAND_MARK_INK.y + BRAND_MARK_INK.height / 2, 10);
    expect(BRAND_MARK_INK.x - x).toBeCloseTo(1.5, 10);
    expect(x + size - (BRAND_MARK_INK.x + BRAND_MARK_INK.width)).toBeCloseTo(7.52, 10);
  });
});

describe("getBrandStackedLayout", () => {
  it("makes the symbol's ink 2 em wide and nudges it 0.046 em left, toward the light outline", () => {
    const layout = getBrandStackedLayout(1000);
    expect(layout.symbolWidth).toBe(2000);
    expect(layout.symbolOffsetX).toBeCloseTo(-46, 0);
  });

  it("keeps 0.42 em from the ink to the tall letters, whatever the line box", () => {
    // Web sets line-height 1: the box top sits 0.841 em above the baseline.
    expect(getBrandStackedLayout(1000, 1).gap).toBeCloseTo(299, 6);
    // React Native's natural box tops out at the 0.992 em ascent.
    expect(getBrandStackedLayout(1000).gap).toBeCloseTo(148, 6);
  });
});

describe("brandMarkCardPath", () => {
  it("draws a closed four-corner path starting on the top edge", () => {
    const d = brandMarkCardPath({ x: 0, y: 0, width: 40, height: 30, radius: 5 });
    expect(d.startsWith("M8,0H32")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(4);
  });

  it("clamps a radius larger than half the short side into a pill", () => {
    const d = brandMarkCardPath({ x: 0, y: 0, width: 40, height: 10, radius: 99 });
    expect(d.startsWith("M5,0H35")).toBe(true);
  });
});

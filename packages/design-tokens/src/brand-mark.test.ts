import { describe, expect, it } from "vitest";
import {
  BRAND_SYMBOL_BACK,
  BRAND_SYMBOL_BOTTOM_LIFT,
  BRAND_SYMBOL_CARD,
  BRAND_SYMBOL_CORNER_RADII,
  BRAND_SYMBOL_FRONT,
  BRAND_SYMBOL_GAP,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SQUARE,
  BRAND_WORDMARK_INK_EM,
  BRAND_WORDMARK_OPTICAL_CENTER_EM,
  brandSymbolCardPath,
  brandSymbolGap,
  getBrandSymbolLockupLayout,
  getBrandSymbolPaths,
  getBrandSymbolStackedLayout,
} from "./brand-mark";

const round = (n: number) => Number(n.toFixed(2));
// The path's points, leaving out each arc's radii.
const points = (d: string) =>
  [...d.replace(/A[\d.]+,[\d.]+ 0 0 1 /g, "A").matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
const xs = (d: string) => points(d).map(([x]) => x);
const ys = (d: string) => points(d).map(([, y]) => y);

describe("stacked symbol geometry", () => {
  it("pins the ink box and card centers approved on 2026-10-15", () => {
    expect([BRAND_SYMBOL_INK.width, BRAND_SYMBOL_INK.height].map(round)).toEqual([136, 162.41]);
    expect([BRAND_SYMBOL_BACK.cx, BRAND_SYMBOL_BACK.cy].map(round)).toEqual([50, 89.91]);
    expect([BRAND_SYMBOL_FRONT.cx, BRAND_SYMBOL_FRONT.cy].map(round)).toEqual([86, 72.5]);
  });

  it("offsets the front card 36 units along the slant and 42% of a card's height up", () => {
    const tan = Math.tan((BRAND_SYMBOL_CARD.slantDeg * Math.PI) / 180);
    const dx = BRAND_SYMBOL_FRONT.cx - BRAND_SYMBOL_BACK.cx;
    const dy = BRAND_SYMBOL_FRONT.cy - BRAND_SYMBOL_BACK.cy;
    expect(dx).toBeCloseTo(36, 10);
    expect(dy).toBeCloseTo(36 * tan - 0.42 * BRAND_SYMBOL_CARD.height, 10);
  });

  it("curves every corner over the same 14 units of edge", () => {
    expect(BRAND_SYMBOL_CORNER_RADII.map(round)).toEqual([7.76, 25.26, 7.76, 25.26]);
    const angles = [58, 122, 58, 122];
    BRAND_SYMBOL_CORNER_RADII.forEach((r, k) => {
      expect(r / Math.tan((angles[k] * Math.PI) / 360)).toBeCloseTo(BRAND_SYMBOL_CARD.curve, 10);
    });
  });

  it("is symmetric under a half turn about the ink box's center", () => {
    expect(BRAND_SYMBOL_BACK.cx + BRAND_SYMBOL_FRONT.cx).toBeCloseTo(BRAND_SYMBOL_INK.width, 10);
    expect(BRAND_SYMBOL_BACK.cy + BRAND_SYMBOL_FRONT.cy).toBeCloseTo(BRAND_SYMBOL_INK.height, 10);
    const [tl, tr, br, bl] = BRAND_SYMBOL_CORNER_RADII;
    expect(tl).toBeCloseTo(br, 10);
    expect(tr).toBeCloseTo(bl, 10);
  });

  it("puts the ink box's edges on the back card's left side and the front card's right", () => {
    const { back, front } = getBrandSymbolPaths();
    expect(Math.min(...xs(back))).toBe(0);
    expect(Math.max(...xs(front))).toBe(136);
    // The extremes in y fall inside the acute corners' arcs, not on an endpoint.
    expect(Math.min(...ys(front))).toBeGreaterThan(0);
    expect(Math.max(...ys(back))).toBeLessThan(BRAND_SYMBOL_INK.height);
  });

  it("averages the bottom edge 0.154 of the ink's height above the lowest corner", () => {
    expect(BRAND_SYMBOL_BOTTOM_LIFT).toBeCloseTo(0.154, 3);
  });

  it("holds the ink centered in the square box", () => {
    const { x, y, size } = BRAND_SYMBOL_SQUARE;
    expect(x + size / 2).toBeCloseTo(BRAND_SYMBOL_INK.width / 2, 10);
    expect(y + size / 2).toBeCloseTo(BRAND_SYMBOL_INK.height / 2, 10);
    expect(-y).toBeCloseTo(0.015 * BRAND_SYMBOL_INK.height, 10);
  });
});

describe("the gap", () => {
  it("is 3.5 units, widened to 7 at 32 px and below and to 5 for one color", () => {
    expect(brandSymbolGap(33)).toBe(3.5);
    expect(brandSymbolGap(32)).toBe(7);
    expect(brandSymbolGap(16, true)).toBe(7);
    expect(brandSymbolGap(64, true)).toBe(5);
    expect(BRAND_SYMBOL_GAP).toEqual({ regular: 3.5, small: 7, oneColor: 5 });
  });

  it("cuts the front card's outline grown by the gap, with each corner keeping its center", () => {
    const cut = brandSymbolCardPath({ ...BRAND_SYMBOL_FRONT, grow: 3.5 });
    expect(getBrandSymbolPaths(3.5).cut).toBe(cut);
    const radii = [...cut.matchAll(/A([\d.]+),/g)].map((m) => Number(m[1]));
    expect(radii).toEqual([28.76, 11.26, 28.76, 11.26]);
    expect(Math.min(...xs(cut))).toBe(32.5);
    expect(Math.max(...xs(cut))).toBe(139.5);
  });

  it("scales a card about its center", () => {
    const half = brandSymbolCardPath({ cx: 0, cy: 0, scale: 0.5 });
    expect([Math.min(...xs(half)), Math.max(...xs(half))]).toEqual([-25, 25]);
  });
});

describe("getBrandSymbolLockupLayout", () => {
  it("spans the word's height plus a round letter's overshoot at each end", () => {
    const { height, width } = getBrandSymbolLockupLayout(1000);
    expect(height).toBeCloseTo(725 + 232 + 24, 10);
    expect(width / height).toBeCloseTo(BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height, 10);
  });

  it("centers the symbol on the wordmark's optical center", () => {
    const { height, belowBaseline } = getBrandSymbolLockupLayout(1000);
    expect(height / 2 - belowBaseline).toBeCloseTo(256, 10);
  });

  it("sits 0.20 em from the word, ink to ink", () => {
    expect(
      getBrandSymbolLockupLayout(1000).marginRight + BRAND_WORDMARK_INK_EM.left * 1000,
    ).toBeCloseTo(200, 10);
  });

  it("scales linearly with the font size", () => {
    const a = getBrandSymbolLockupLayout(26);
    const b = getBrandSymbolLockupLayout(52);
    expect(b.width).toBeCloseTo(2 * a.width, 10);
    expect(b.belowBaseline).toBeCloseTo(2 * a.belowBaseline, 10);
  });
});

describe("getBrandSymbolStackedLayout", () => {
  it("makes the symbol twice the lockup symbol's height, centered on the word's optical center", () => {
    const layout = getBrandSymbolStackedLayout(1000);
    expect(layout.symbolHeight).toBeCloseTo(1962, 10);
    expect(layout.symbolOffsetX).toBe(1000 * BRAND_WORDMARK_OPTICAL_CENTER_EM.x);
  });

  it("keeps 0.42 em above the ascenders from the bottom edge on average, whatever the line box", () => {
    const lowestAboveAscender = 0.42 - BRAND_SYMBOL_BOTTOM_LIFT * 1.962;
    expect(lowestAboveAscender).toBeCloseTo(0.117, 3);
    // Web sets line-height 1: the box top sits 0.841 em above the baseline, 0.116 over the ascenders.
    expect(getBrandSymbolStackedLayout(1000, 1).gap).toBeCloseTo(
      1000 * (lowestAboveAscender - 0.116),
      6,
    );
    // React Native's natural box tops out at the 0.992 em ascent.
    expect(getBrandSymbolStackedLayout(1000).gap).toBeCloseTo(
      1000 * (lowestAboveAscender - 0.267),
      6,
    );
  });
});

describe("BRAND_WORDMARK_OPTICAL_CENTER_EM", () => {
  // DM Sans Bold `dubgrid` at -0.02em tracking, measured by rasterizing the glyphs.
  const box = { y: 0.247, x: 0 };
  const mass = { y: 0.266, x: 0.031 };

  it("sits within 0.016 em of both the ink box center and the ink's center of mass", () => {
    for (const axis of ["x", "y"] as const) {
      const center = BRAND_WORDMARK_OPTICAL_CENTER_EM[axis];
      expect(Math.abs(center - box[axis])).toBeLessThanOrEqual(0.016);
      expect(Math.abs(center - mass[axis])).toBeLessThanOrEqual(0.016);
    }
  });
});

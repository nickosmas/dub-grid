/**
 * The stacked two-card DubGrid symbol and its lockups with the `dubgrid`
 * wordmark, shared by web, mobile and the asset generators so every surface
 * draws the same mark. Cards are 100 units wide; coordinates are in the
 * symbol's ink box, whose top-left corner is the origin.
 */

/**
 * Where the eye reads the middle of the `dubgrid` wordmark, in em, measured
 * from DM Sans Bold: midway between the ink box's center and the ink's center
 * of mass. Vertically, above the baseline: the box (g's descender to the
 * ascenders) centers at 0.247 and the mass at 0.266, which sits in the
 * x-height band. Horizontally, right of the text box's center: the box is
 * centered and the mass sits 0.031 right.
 */
export const BRAND_WORDMARK_OPTICAL_CENTER_EM = { x: 0.016, y: 0.256 } as const;
export const BRAND_WORDMARK_TRACKING_EM = -0.02;

/**
 * DM Sans Bold's line box in em: its ascent and descent (hhea, also the typo
 * metrics the font asks for).
 */
export const BRAND_WORDMARK_METRICS_EM = { ascent: 0.992, descent: 0.31 } as const;

/**
 * The `dubgrid` ink, in em from the origin and baseline (up is positive),
 * measured from the pinned DM Sans Bold file: where the "d" starts, the tops
 * of "d" and "b", the bottom of "g", and how far round letters pass a line
 * ("o" spans -0.012 to 0.516 em).
 */
export const BRAND_WORDMARK_INK_EM = {
  left: 0.051,
  ascender: 0.725,
  descender: -0.232,
  overshoot: 0.012,
} as const;

/**
 * One card: a parallelogram with vertical sides and top and bottom edges
 * slanted down to the right. Every corner is a circular arc that curves over
 * the same length of edge, so the acute and obtuse corners look equally soft.
 */
export const BRAND_SYMBOL_CARD = { width: 100, height: 95, slantDeg: 32, curve: 14 } as const;

/** The front card sits this far along the slant and this share of a card's height up. */
const FRONT_ALONG = 36;
const FRONT_UP = 0.42;

/**
 * Width of the surface-colored gap cut out of the back card around the front
 * card. Below `BRAND_SYMBOL_SMALL_MAX_PX` the small gap keeps the cards apart;
 * a one-color symbol needs a wider gap, as its cards share a color.
 */
export const BRAND_SYMBOL_GAP = { regular: 3.5, small: 7, oneColor: 5 } as const;
export const BRAND_SYMBOL_SMALL_MAX_PX = 32;

/** The gap for a symbol drawn `heightPx` tall. */
export function brandSymbolGap(heightPx: number, oneColor = false): number {
  if (heightPx <= BRAND_SYMBOL_SMALL_MAX_PX) return BRAND_SYMBOL_GAP.small;
  return oneColor ? BRAND_SYMBOL_GAP.oneColor : BRAND_SYMBOL_GAP.regular;
}

/**
 * The stronger card goes in front: brand blue on light and dark surfaces,
 * white on a brand-blue one. The back card recedes by the same amount in
 * both themes, 2.16:1 to its surface.
 */
export const BRAND_SYMBOL_COLORS = {
  light: { back: "#8FB0F8", front: "#2563EB" },
  dark: { back: "#1E40AF", front: "#3B82F6" },
  onBrand: { back: "#7199F2", front: "#FFFFFF" },
} as const;

type Point = readonly [number, number];

interface Corner {
  /** Arc center, relative to the card's center. */
  readonly center: Point;
  readonly radius: number;
  /** Outward normals of the edges arriving at and leaving the corner. */
  readonly inNormal: Point;
  readonly outNormal: Point;
}

const tan = Math.tan((BRAND_SYMBOL_CARD.slantDeg * Math.PI) / 180);

function cardCorners(): readonly Corner[] {
  const { width: w, height: h, curve } = BRAND_SYMBOL_CARD;
  const cy = (w * tan) / 2 + h / 2;
  const pts: Point[] = [
    [-w / 2, -cy],
    [w / 2, w * tan - cy],
    [w / 2, w * tan + h - cy],
    [-w / 2, h - cy],
  ];
  const unit = ([x, y]: Point): Point => [x / Math.hypot(x, y), y / Math.hypot(x, y)];
  // Clockwise on screen with y down, so an edge's outward normal is (dy, -dx).
  const normal = (a: Point, b: Point): Point => unit([b[1] - a[1], a[0] - b[0]]);
  return pts.map((v, k) => {
    const prev = pts[(k + 3) % 4];
    const next = pts[(k + 1) % 4];
    const toPrev = unit([prev[0] - v[0], prev[1] - v[1]]);
    const toNext = unit([next[0] - v[0], next[1] - v[1]]);
    const angle = Math.acos(toPrev[0] * toNext[0] + toPrev[1] * toNext[1]);
    const radius = curve * Math.tan(angle / 2);
    const bisector = unit([toPrev[0] + toNext[0], toPrev[1] + toNext[1]]);
    const reach = radius / Math.sin(angle / 2);
    return {
      center: [v[0] + bisector[0] * reach, v[1] + bisector[1] * reach],
      radius,
      inNormal: normal(prev, v),
      outNormal: normal(v, next),
    };
  });
}

const CORNERS = cardCorners();

/** Corner radii, clockwise from the top-left: acute, obtuse, acute, obtuse. */
export const BRAND_SYMBOL_CORNER_RADII = CORNERS.map((c) => c.radius);

// The card is the convex hull of its corner circles, so its extent in any
// direction is the farthest circle's.
const extent = (cx: number, cy: number) => ({
  left: Math.min(...CORNERS.map((c) => cx + c.center[0] - c.radius)),
  right: Math.max(...CORNERS.map((c) => cx + c.center[0] + c.radius)),
  top: Math.min(...CORNERS.map((c) => cy + c.center[1] - c.radius)),
  bottom: Math.max(...CORNERS.map((c) => cy + c.center[1] + c.radius)),
});

const backRaw: Point = [0, 0];
const frontRaw: Point = [FRONT_ALONG, FRONT_ALONG * tan - FRONT_UP * BRAND_SYMBOL_CARD.height];
const backBox = extent(...backRaw);
const frontBox = extent(...frontRaw);
const origin: Point = [Math.min(backBox.left, frontBox.left), Math.min(backBox.top, frontBox.top)];

/** The symbol's ink box. Its center is the optical center: the outline is symmetric under a half turn. */
export const BRAND_SYMBOL_INK = {
  width: Math.max(backBox.right, frontBox.right) - origin[0],
  height: Math.max(backBox.bottom, frontBox.bottom) - origin[1],
} as const;

/** Card centers in the ink box. */
export const BRAND_SYMBOL_BACK = {
  cx: backRaw[0] - origin[0],
  cy: backRaw[1] - origin[1],
} as const;
export const BRAND_SYMBOL_FRONT = {
  cx: frontRaw[0] - origin[0],
  cy: frontRaw[1] - origin[1],
} as const;

const fmt = (n: number) => Number(n.toFixed(2)).toString();

export interface BrandSymbolCardPlacement {
  readonly cx: number;
  readonly cy: number;
  /** Scales the card about its center. */
  readonly scale?: number;
  /** Grows the outline outward by this much, as the gap's cut does. */
  readonly grow?: number;
}

/** SVG path for one card, its corners exact circular arcs. */
export function brandSymbolCardPath({
  cx,
  cy,
  scale = 1,
  grow = 0,
}: BrandSymbolCardPlacement): string {
  const at = (c: Corner, n: Point): Point => {
    const r = c.radius * scale + grow;
    return [cx + c.center[0] * scale + n[0] * r, cy + c.center[1] * scale + n[1] * r];
  };
  const pt = ([x, y]: Point) => `${fmt(x)},${fmt(y)}`;
  let d = `M${pt(at(CORNERS[0], CORNERS[0].outNormal))}`;
  for (let k = 1; k <= 4; k++) {
    const c = CORNERS[k % 4];
    const r = fmt(c.radius * scale + grow);
    d += `L${pt(at(c, c.inNormal))}A${r},${r} 0 0 1 ${pt(at(c, c.outNormal))}`;
  }
  return `${d}Z`;
}

export interface BrandSymbolPaths {
  readonly back: string;
  readonly front: string;
  /** The front card grown by the gap: mask it out of the back card. */
  readonly cut: string;
}

export function getBrandSymbolPaths(gap: number = BRAND_SYMBOL_GAP.regular): BrandSymbolPaths {
  return {
    back: brandSymbolCardPath(BRAND_SYMBOL_BACK),
    front: brandSymbolCardPath(BRAND_SYMBOL_FRONT),
    cut: brandSymbolCardPath({ ...BRAND_SYMBOL_FRONT, grow: gap }),
  };
}

// Clear space around the ink in a square box, as a share of the ink's height.
const SQUARE_MARGIN = 0.015;
const squareSize = BRAND_SYMBOL_INK.height * (1 + 2 * SQUARE_MARGIN);

/** A square box holding the symbol centered. Favicons, app icons and the splash mark are drawn in it. */
export const BRAND_SYMBOL_SQUARE = {
  x: (BRAND_SYMBOL_INK.width - squareSize) / 2,
  y: (BRAND_SYMBOL_INK.height - squareSize) / 2,
  size: squareSize,
} as const;

/**
 * How far the symbol's bottom edge sits above its lowest corner on average,
 * as a share of its ink height: the mean over the ink's width of the gap
 * between the lowest corner and the bottom of the ink in that column.
 */
function bottomLift(columns = 400): number {
  const lowest = new Array<number>(columns).fill(-Infinity);
  const mark = (x: number, y: number) => {
    const i = Math.min(
      columns - 1,
      Math.max(0, Math.floor((x / BRAND_SYMBOL_INK.width) * columns)),
    );
    lowest[i] = Math.max(lowest[i], y);
  };
  for (const { cx, cy } of [BRAND_SYMBOL_BACK, BRAND_SYMBOL_FRONT]) {
    CORNERS.forEach((c, k) => {
      const next = CORNERS[(k + 1) % 4];
      const a0 = Math.atan2(c.inNormal[1], c.inNormal[0]);
      let a1 = Math.atan2(c.outNormal[1], c.outNormal[0]);
      if (a1 < a0) a1 += 2 * Math.PI;
      for (let a = a0; a <= a1; a += 0.005) {
        mark(cx + c.center[0] + c.radius * Math.cos(a), cy + c.center[1] + c.radius * Math.sin(a));
      }
      const from: Point = [
        cx + c.center[0] + c.outNormal[0] * c.radius,
        cy + c.center[1] + c.outNormal[1] * c.radius,
      ];
      const to: Point = [
        cx + next.center[0] + c.outNormal[0] * next.radius,
        cy + next.center[1] + c.outNormal[1] * next.radius,
      ];
      const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.1);
      for (let s = 0; s <= steps; s++) {
        mark(from[0] + ((to[0] - from[0]) * s) / steps, from[1] + ((to[1] - from[1]) * s) / steps);
      }
    });
  }
  const bottom = Math.max(...lowest);
  const mean = lowest.reduce((sum, y) => sum + y, 0) / columns;
  return (bottom - mean) / BRAND_SYMBOL_INK.height;
}

export const BRAND_SYMBOL_BOTTOM_LIFT = bottomLift();

/**
 * The horizontal lockup, in em of the wordmark: the symbol spans the word's
 * height plus a round letter's overshoot at each end, and sits two
 * straight-to-round letter gaps from the word, ink to ink.
 */
export const BRAND_SYMBOL_LOCKUP_EM = {
  height:
    BRAND_WORDMARK_INK_EM.ascender -
    BRAND_WORDMARK_INK_EM.descender +
    2 * BRAND_WORDMARK_INK_EM.overshoot,
  gap: 0.2,
} as const;

/**
 * The stacked lockup (sign-in, splash): the symbol twice the lockup symbol's
 * height, with `gap` em of clear space above the ascenders measured from its
 * bottom edge on average.
 */
export const BRAND_SYMBOL_STACKED_EM = {
  height: 2 * BRAND_SYMBOL_LOCKUP_EM.height,
  gap: 0.42,
} as const;

/** Size and placement of the ink-cropped symbol beside a wordmark of `fontSize`. */
export interface BrandSymbolLockupLayout {
  readonly width: number;
  readonly height: number;
  /** Space after the ink to the wordmark's origin, so the word's ink starts `gap` em past it. */
  readonly marginRight: number;
  /** How far the ink's bottom sits below the baseline, centering it on the word's optical center. */
  readonly belowBaseline: number;
}

export function getBrandSymbolLockupLayout(fontSize: number): BrandSymbolLockupLayout {
  const height = BRAND_SYMBOL_LOCKUP_EM.height * fontSize;
  return {
    width: (BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height) * height,
    height,
    marginRight: (BRAND_SYMBOL_LOCKUP_EM.gap - BRAND_WORDMARK_INK_EM.left) * fontSize,
    belowBaseline: height / 2 - BRAND_WORDMARK_OPTICAL_CENTER_EM.y * fontSize,
  };
}

export interface BrandSymbolStackedLayout {
  readonly symbolWidth: number;
  readonly symbolHeight: number;
  /** Shift for the symbol from centered on the wordmark's text box to centered on the word's optical center. */
  readonly symbolOffsetX: number;
  /** Space from the symbol's lowest point to the top of the wordmark's line box; negative overlaps it. */
  readonly gap: number;
}

/**
 * The stacked lockup for a wordmark of `fontSize` set at `lineHeight` (in em;
 * the font's natural line box when omitted, as React Native draws it).
 */
export function getBrandSymbolStackedLayout(
  fontSize: number,
  lineHeight = BRAND_WORDMARK_METRICS_EM.ascent + BRAND_WORDMARK_METRICS_EM.descent,
): BrandSymbolStackedLayout {
  const { ascent, descent } = BRAND_WORDMARK_METRICS_EM;
  const height = BRAND_SYMBOL_STACKED_EM.height;
  const lowestAboveAscender = BRAND_SYMBOL_STACKED_EM.gap - BRAND_SYMBOL_BOTTOM_LIFT * height;
  const boxTopAboveBaseline = ascent + (lineHeight - ascent - descent) / 2;
  return {
    symbolWidth: (BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height) * height * fontSize,
    symbolHeight: height * fontSize,
    symbolOffsetX: BRAND_WORDMARK_OPTICAL_CENTER_EM.x * fontSize,
    gap: (lowestAboveAscender - (boxTopAboveBaseline - BRAND_WORDMARK_INK_EM.ascender)) * fontSize,
  };
}

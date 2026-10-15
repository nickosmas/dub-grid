/**
 * The stacked three-card DubGrid symbol and its lockups with the `dubgrid`
 * wordmark, shared by web, mobile and the asset generators so every surface
 * draws the same mark. The center card is 100 units wide; coordinates are in
 * the symbol's ink box, whose top-left corner is the origin.
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

/** The back and front cards are this share of the center card's size. */
const SIDE_SCALE = 0.75;
/**
 * Each card sits this far along the slant and this share of a card's height
 * up from the one behind it, measured with the two cards' average width.
 */
const STEP_ALONG = 0.36;
const STEP_UP = 0.42;

/**
 * Width of the surface-colored gap cut out of each card around the cards in
 * front of it. Below `BRAND_SYMBOL_SMALL_MAX_PX` the small gap keeps the cards apart;
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
 * The center card is the strongest: brand blue on light and dark surfaces,
 * white on a brand-blue one. The back and front cards share a receding color.
 */
export const BRAND_SYMBOL_COLORS = {
  light: { side: "#8FB0F8", center: "#2563EB" },
  dark: { side: "#1E40AF", center: "#3B82F6" },
  onBrand: { side: "#9DBBF7", center: "#FFFFFF" },
} as const;

export type BrandSymbolTone = keyof (typeof BRAND_SYMBOL_COLORS)["light"];

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
const extent = (cx: number, cy: number, scale: number) => ({
  left: Math.min(...CORNERS.map((c) => cx + (c.center[0] - c.radius) * scale)),
  right: Math.max(...CORNERS.map((c) => cx + (c.center[0] + c.radius) * scale)),
  top: Math.min(...CORNERS.map((c) => cy + (c.center[1] - c.radius) * scale)),
  bottom: Math.max(...CORNERS.map((c) => cy + (c.center[1] + c.radius) * scale)),
});

const stepWidth = (BRAND_SYMBOL_CARD.width * (1 + SIDE_SCALE)) / 2;
const STEP: Point = [
  STEP_ALONG * stepWidth,
  STEP_ALONG * stepWidth * tan -
    STEP_UP * (BRAND_SYMBOL_CARD.height / BRAND_SYMBOL_CARD.width) * stepWidth,
];
const RAW = [
  { at: [-STEP[0], -STEP[1]] as Point, scale: SIDE_SCALE, tone: "side" as const },
  { at: [0, 0] as Point, scale: 1, tone: "center" as const },
  { at: STEP, scale: SIDE_SCALE, tone: "side" as const },
];
const boxes = RAW.map((c) => extent(c.at[0], c.at[1], c.scale));
const origin: Point = [Math.min(...boxes.map((b) => b.left)), Math.min(...boxes.map((b) => b.top))];

/** The symbol's ink box. Its center is the center card's: the outline is symmetric under a half turn. */
export const BRAND_SYMBOL_INK = {
  width: Math.max(...boxes.map((b) => b.right)) - origin[0],
  height: Math.max(...boxes.map((b) => b.bottom)) - origin[1],
} as const;

export interface BrandSymbolCard {
  /** Center in the ink box. */
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly tone: BrandSymbolTone;
}

/** The cards from back to front. */
export const BRAND_SYMBOL_CARDS: readonly BrandSymbolCard[] = RAW.map((c) => ({
  cx: c.at[0] - origin[0],
  cy: c.at[1] - origin[1],
  scale: c.scale,
  tone: c.tone,
}));

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

export interface BrandSymbolCardPaths {
  readonly path: string;
  /** The cards in front grown by the gap: mask them out of this card. Empty for the front card. */
  readonly cut: readonly string[];
  readonly tone: BrandSymbolTone;
}

/** Each card's outline and cut, back to front. */
export function getBrandSymbolPaths(
  gap: number = BRAND_SYMBOL_GAP.regular,
): readonly BrandSymbolCardPaths[] {
  return BRAND_SYMBOL_CARDS.map((card, index) => ({
    path: brandSymbolCardPath(card),
    cut: BRAND_SYMBOL_CARDS.slice(index + 1).map((ahead) =>
      brandSymbolCardPath({ ...ahead, grow: gap }),
    ),
    tone: card.tone,
  }));
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
  for (const { cx, cy, scale } of BRAND_SYMBOL_CARDS) {
    const corners = CORNERS.map((c) => ({
      ...c,
      center: [c.center[0] * scale, c.center[1] * scale] as Point,
      radius: c.radius * scale,
    }));
    corners.forEach((c, k) => {
      const next = corners[(k + 1) % 4];
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

// Whether a point lies inside a card: inside all four edges, and inside the
// corner's circle where it is past both edges' tangent points.
function insideCard(card: BrandSymbolCard, x: number, y: number): boolean {
  return CORNERS.every((c) => {
    const dx = x - (card.cx + c.center[0] * card.scale);
    const dy = y - (card.cy + c.center[1] * card.scale);
    const r = c.radius * card.scale;
    const alongIn = dx * c.inNormal[0] + dy * c.inNormal[1];
    const alongOut = dx * c.outNormal[0] + dy * c.outNormal[1];
    if (alongIn > r || alongOut > r) return false;
    return alongIn <= 0 || alongOut <= 0 || Math.hypot(dx, dy) <= r;
  });
}

/**
 * How far below the ink box's center the eye centers the mark, as a share of
 * its ink height. The eye takes the strongest card as the mark, and only what
 * shows of it: the front card covers its upper right, so the visible part
 * sits a little low.
 */
function visibleCenterDrop(steps = 400): number {
  const centerIndex = BRAND_SYMBOL_CARDS.findIndex((c) => c.tone === "center");
  const center = BRAND_SYMBOL_CARDS[centerIndex];
  const ahead = BRAND_SYMBOL_CARDS.slice(centerIndex + 1);
  const step = Math.max(BRAND_SYMBOL_INK.width, BRAND_SYMBOL_INK.height) / steps;
  let count = 0;
  let sumY = 0;
  for (let y = step / 2; y < BRAND_SYMBOL_INK.height; y += step) {
    for (let x = step / 2; x < BRAND_SYMBOL_INK.width; x += step) {
      if (!insideCard(center, x, y) || ahead.some((card) => insideCard(card, x, y))) continue;
      count++;
      sumY += y;
    }
  }
  return (sumY / count - BRAND_SYMBOL_INK.height / 2) / BRAND_SYMBOL_INK.height;
}

export const BRAND_SYMBOL_VISIBLE_CENTER_DROP = visibleCenterDrop();

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
  /**
   * How far the ink's bottom sits below the baseline, so the word's optical
   * center meets the visible center of the mark's strongest card.
   */
  readonly belowBaseline: number;
}

export function getBrandSymbolLockupLayout(fontSize: number): BrandSymbolLockupLayout {
  const height = BRAND_SYMBOL_LOCKUP_EM.height * fontSize;
  return {
    width: (BRAND_SYMBOL_INK.width / BRAND_SYMBOL_INK.height) * height,
    height,
    marginRight: (BRAND_SYMBOL_LOCKUP_EM.gap - BRAND_WORDMARK_INK_EM.left) * fontSize,
    belowBaseline:
      height / 2 -
      BRAND_WORDMARK_OPTICAL_CENTER_EM.y * fontSize -
      BRAND_SYMBOL_VISIBLE_CENTER_DROP * height,
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

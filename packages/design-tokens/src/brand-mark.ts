/**
 * The two-card DubGrid symbol and its lockup with the `dubgrid` wordmark,
 * shared by web, mobile and the asset generators so every surface draws the
 * same mark. Coordinates are in a 100-unit square box.
 */

export interface BrandMarkCard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

export const BRAND_MARK_VIEWBOX = 100;

// Schedule cells are wider than tall, so both cards are 4:3.
const ASPECT = 4 / 3;
const BACK_SCALE = 0.9;
// Share of the back card's width left showing beside the front card. Closer
// than this and the outline vanishes at 16 px.
const BACK_SHOWING = 0.3;
const INSET = 3;

const frontWidth = (BRAND_MARK_VIEWBOX - 2 * INSET) / (BACK_SCALE * BACK_SHOWING + 1);
const frontHeight = frontWidth / ASPECT;
const backWidth = BACK_SCALE * frontWidth;
const backHeight = BACK_SCALE * frontHeight;
const center = BRAND_MARK_VIEWBOX / 2;

export const BRAND_MARK_BACK: BrandMarkCard = {
  x: INSET,
  y: center - backHeight / 2,
  width: backWidth,
  height: backHeight,
  radius: 0.25 * backHeight,
};

export const BRAND_MARK_FRONT: BrandMarkCard = {
  x: INSET + BACK_SHOWING * backWidth,
  y: center - frontHeight / 2,
  width: frontWidth,
  height: frontHeight,
  radius: 0.274 * frontHeight,
};

/** Stroke width of the outlined back card. */
export const BRAND_MARK_BACK_STROKE = 6;

/**
 * Width of the surface-colored gap cut around the front card. Drawn as a
 * stroke of twice this width under the front card's fill, so the gap always
 * takes the color of whatever surface the mark sits on.
 */
export const BRAND_MARK_GAP = 6;

export const BRAND_MARK_CORNER_SMOOTHING = 0.6;

const inkTop = Math.min(BRAND_MARK_BACK.y - BRAND_MARK_BACK_STROKE / 2, BRAND_MARK_FRONT.y);
const inkBottom = Math.max(
  BRAND_MARK_BACK.y + BRAND_MARK_BACK.height + BRAND_MARK_BACK_STROKE / 2,
  BRAND_MARK_FRONT.y + BRAND_MARK_FRONT.height,
);

/** The symbol's visible ink inside the 100-unit box: crop a viewBox to it. */
export const BRAND_MARK_INK = {
  x: BRAND_MARK_BACK.x - BRAND_MARK_BACK_STROKE / 2,
  y: inkTop,
  width:
    BRAND_MARK_FRONT.x + BRAND_MARK_FRONT.width - (BRAND_MARK_BACK.x - BRAND_MARK_BACK_STROKE / 2),
  height: inkBottom - inkTop,
} as const;

export const BRAND_MARK_COLORS = {
  light: "#2563EB",
  dark: "#4A9BFF",
  onBrand: "#FFFFFF",
  mono: "#111827",
} as const;

/**
 * The symbol's height in the lockup, in em of the wordmark: the front card is
 * as tall as an ascender (720 of DM Sans's 1000 units).
 */
export const BRAND_LOCKUP_SYMBOL_EM = 0.72;

/**
 * Where the eye reads the middle of the `dubgrid` wordmark, in em, measured
 * from DM Sans Bold: midway between the ink box's center and the ink's center
 * of mass. Vertically, above the baseline: the box (g's descender to the
 * ascenders) centers at 0.247 and the mass at 0.266, which sits in the
 * x-height band. Horizontally, right of the text box's center: the box is
 * centered and the mass sits 0.031 right.
 */
export const BRAND_WORDMARK_OPTICAL_CENTER_EM = { x: 0.016, y: 0.256 } as const;

/**
 * The symbol's optical center, right of its ink center, in 100-unit box
 * units: half the 6.02 units the solid front card pulls its mass right.
 * Vertically it is balanced.
 */
export const BRAND_MARK_OPTICAL_OFFSET_X = 3.01;

// Clear space either side of the ink in a square box, beyond the optical shift.
const SQUARE_MARGIN = 1.5;
const squareSize = BRAND_MARK_INK.width + 2 * (BRAND_MARK_OPTICAL_OFFSET_X + SQUARE_MARGIN);

/**
 * A square box, in the symbol's units, that holds the symbol optically
 * centered: the ink shifts left of center by `BRAND_MARK_OPTICAL_OFFSET_X`.
 * Favicons, app icons and the splash mark are drawn in it.
 */
export const BRAND_MARK_SQUARE = {
  x: BRAND_MARK_INK.x - (squareSize - BRAND_MARK_INK.width) / 2 + BRAND_MARK_OPTICAL_OFFSET_X,
  y: BRAND_MARK_INK.y + BRAND_MARK_INK.height / 2 - squareSize / 2,
  size: squareSize,
} as const;
/** Space from the symbol's right edge to the wordmark's origin, in em. */
export const BRAND_LOCKUP_GAP_EM = 0.23;
export const BRAND_WORDMARK_TRACKING_EM = -0.02;

/**
 * DM Sans Bold's vertical metrics in em: the line box's ascent and descent
 * (hhea, also the typo metrics the font asks for) and the height its tall
 * letters reach.
 */
export const BRAND_WORDMARK_METRICS_EM = { ascent: 0.992, descent: 0.31, ascender: 0.72 } as const;

/**
 * The stacked lockup (sign-in, splash): the symbol above the wordmark, its ink
 * this many em of the wordmark wide, with this many em of clear space between
 * the ink and the tops of the tall letters.
 */
export const BRAND_STACKED_SYMBOL_EM = 2;
export const BRAND_STACKED_GAP_EM = 0.42;

/** Size and placement of the ink-cropped symbol beside a wordmark of `fontSize`. */
export interface BrandLockupSymbolLayout {
  readonly width: number;
  readonly height: number;
  /** Space after the ink, so the wordmark starts `BRAND_LOCKUP_GAP_EM` past it. */
  readonly marginRight: number;
  /**
   * How far the ink's bottom sits below the baseline, so the symbol's center
   * meets the wordmark's optical center.
   */
  readonly belowBaseline: number;
}

export function getBrandLockupSymbolLayout(fontSize: number): BrandLockupSymbolLayout {
  const unit = (BRAND_LOCKUP_SYMBOL_EM * fontSize) / BRAND_MARK_FRONT.height;
  const height = BRAND_MARK_INK.height * unit;
  return {
    width: BRAND_MARK_INK.width * unit,
    height,
    marginRight: BRAND_LOCKUP_GAP_EM * fontSize,
    belowBaseline: height / 2 - BRAND_WORDMARK_OPTICAL_CENTER_EM.y * fontSize,
  };
}

export interface BrandStackedLayout {
  /** Width of the symbol's ink. */
  readonly symbolWidth: number;
  /**
   * Shift for the symbol from centered on the wordmark's text box to
   * optically centered on the word. Negative is left.
   */
  readonly symbolOffsetX: number;
  /** Space from the symbol's ink to the top of the wordmark's line box. */
  readonly gap: number;
}

/**
 * The stacked lockup for a wordmark of `fontSize` set at `lineHeight` (in em;
 * the font's natural line box when omitted, as React Native draws it).
 */
export function getBrandStackedLayout(
  fontSize: number,
  lineHeight = BRAND_WORDMARK_METRICS_EM.ascent + BRAND_WORDMARK_METRICS_EM.descent,
): BrandStackedLayout {
  const { ascent, descent, ascender } = BRAND_WORDMARK_METRICS_EM;
  const symbolWidth = BRAND_STACKED_SYMBOL_EM * fontSize;
  const unit = symbolWidth / BRAND_MARK_INK.width;
  const boxTopAboveBaseline = ascent + (lineHeight - ascent - descent) / 2;
  return {
    symbolWidth,
    symbolOffsetX:
      BRAND_WORDMARK_OPTICAL_CENTER_EM.x * fontSize - BRAND_MARK_OPTICAL_OFFSET_X * unit,
    gap: (BRAND_STACKED_GAP_EM - (boxTopAboveBaseline - ascender)) * fontSize,
  };
}

const fmt = (n: number) => Number(n.toFixed(2)).toString();

/**
 * SVG path for a card with continuous (squircle-like) corners: each corner
 * starts `radius * (1 + smoothing)` from the vertex and is drawn as one
 * cubic, which reads smoother than a circular arc.
 */
export function brandMarkCardPath(
  { x, y, width: w, height: h, radius }: BrandMarkCard,
  smoothing = BRAND_MARK_CORNER_SMOOTHING,
): string {
  const half = Math.min(w, h) / 2;
  const r = Math.max(0, Math.min(radius, half));
  const p = Math.min(r * (1 + smoothing), half);
  const q = Math.max(0, (2.343 * r - p) / 3);
  const c = (...pts: number[]) => pts.map(fmt);
  return [
    `M${c(x + p, y)}`,
    `H${fmt(x + w - p)}`,
    `C${c(x + w - q, y)} ${c(x + w, y + q)} ${c(x + w, y + p)}`,
    `V${fmt(y + h - p)}`,
    `C${c(x + w, y + h - q)} ${c(x + w - q, y + h)} ${c(x + w - p, y + h)}`,
    `H${fmt(x + p)}`,
    `C${c(x + q, y + h)} ${c(x, y + h - q)} ${c(x, y + h - p)}`,
    `V${fmt(y + p)}`,
    `C${c(x, y + q)} ${c(x + q, y)} ${c(x + p, y)}`,
    "Z",
  ].join("");
}

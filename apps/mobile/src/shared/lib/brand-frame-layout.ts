import {
  BRAND_SYMBOL_CARD_BOX,
  BRAND_SYMBOL_CARDS,
  BRAND_SYMBOL_GAP,
  BRAND_SYMBOL_INK,
  BRAND_SYMBOL_SQUARE,
  brandSymbolGap,
  type BrandMotionFrame,
  type BrandSymbolTone,
} from "@dubgrid/design-tokens";

export type BrandFrameImage = "card" | "halo" | "halo-side";

export interface BrandFramePiece {
  readonly image: BrandFrameImage;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly tint: string;
}

// The halo images are a full card grown by the gap, and a full card grown by
// the gap over the side scale, so a side card's halo is exact once scaled.
const SIDE_SCALE = BRAND_SYMBOL_CARDS[0].scale;
const HALO_GROW = {
  halo: BRAND_SYMBOL_GAP.regular,
  "halo-side": BRAND_SYMBOL_GAP.regular / SIDE_SCALE,
};
// A card's mean distance from its center to its edges (50 to the sides, 40.3
// to the slanted top and bottom). Scaling a halo by the ratio of reaches
// approximates growing it by another amount, for gaps between the two drawn.
const CARD_REACH = 45;
const HIDDEN_OPACITY = 0.01;
const HAIRLINE_PX = 0.25;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** `t` of the way from `from` to `to`, both `#RRGGBB`. */
export function mixHex(from: string, to: string, t: number): string {
  if (t <= 0.002) return from;
  if (t >= 0.998) return to;
  const a = channels(from);
  const b = channels(to);
  const mixed = a.map((c, i) => Math.round(c + (b[i] - c) * t));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * Lays a motion frame out as tinted card images in a `size` square, back to
 * front. Without masks, the gap is painted: before each card that has cards
 * behind it comes a halo, the card grown by the gap in `surface`'s color, so
 * the mark must sit on a plain `surface`.
 */
export function layoutBrandFrame(
  frame: BrandMotionFrame,
  size: number,
  colors: Record<BrandSymbolTone, string>,
  surface: string,
): BrandFramePiece[] {
  const unit = size / BRAND_SYMBOL_SQUARE.size;
  const gap = brandSymbolGap(BRAND_SYMBOL_INK.height * unit) * frame.gap;
  const box = BRAND_SYMBOL_CARD_BOX;
  const place = (cx: number, cy: number, scale: number) => ({
    left: (cx + box.x * scale - BRAND_SYMBOL_SQUARE.x) * unit,
    top: (cy + box.y * scale - BRAND_SYMBOL_SQUARE.y) * unit,
    width: box.width * scale * unit,
    height: box.height * scale * unit,
  });

  const pieces: BrandFramePiece[] = [];
  const visible = frame.cards.filter((card) => card.opacity >= HIDDEN_OPACITY);
  visible.forEach((card, index) => {
    const grow = gap / card.scale;
    if (index > 0 && gap * unit >= HAIRLINE_PX) {
      const image = card.scale < (1 + SIDE_SCALE) / 2 ? "halo-side" : "halo";
      const stretch = (CARD_REACH + grow) / (CARD_REACH + HALO_GROW[image]);
      pieces.push({
        image,
        ...place(card.cx, card.cy, card.scale * stretch),
        opacity: card.opacity,
        tint: surface,
      });
    }
    pieces.push({
      image: "card",
      ...place(card.cx, card.cy, card.scale),
      opacity: card.opacity,
      tint: mixHex(colors.side, colors.center, card.color),
    });
  });
  return pieces;
}

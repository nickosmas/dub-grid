import { describe, expect, it } from "vitest";
import {
  BRAND_ANIMATED_LOGO_SIZE,
  BRAND_SYMBOL_CARD_BOX,
  BRAND_SYMBOL_CARDS,
  BRAND_SYMBOL_COLORS,
  BRAND_SYMBOL_SQUARE,
  brandMotionFrames,
  brandRestFrame,
} from "@dubgrid/design-tokens";
import { layoutBrandFrame, mixHex } from "./brand-frame-layout";

const COLORS = BRAND_SYMBOL_COLORS.light;
const SURFACE = "#FFFFFF";
const SIZE = BRAND_ANIMATED_LOGO_SIZE;
const UNIT = SIZE / BRAND_SYMBOL_SQUARE.size;

describe("mixHex", () => {
  it("returns the ends exactly and mixes channels between them", () => {
    expect(mixHex("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mixHex("#000000", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mixHex("#000000", "#FF8040", 0.5)).toBe("#804020");
  });
});

describe("layoutBrandFrame", () => {
  const rest = layoutBrandFrame(brandRestFrame(), SIZE, COLORS, SURFACE);

  it("draws the rest frame as the static mark: three cards, a gap before each card in front", () => {
    expect(rest.map((p) => p.image)).toEqual(["card", "halo", "card", "halo-side", "card"]);
    expect(rest.filter((p) => p.image === "card").map((p) => p.tint)).toEqual([
      COLORS.side,
      COLORS.center,
      COLORS.side,
    ]);
    expect(rest.filter((p) => p.image !== "card").every((p) => p.tint === SURFACE)).toBe(true);
  });

  it("centers each card's image on the card at its scale", () => {
    const cards = rest.filter((p) => p.image === "card");
    cards.forEach((piece, i) => {
      const card = BRAND_SYMBOL_CARDS[i];
      expect(piece.width).toBeCloseTo(BRAND_SYMBOL_CARD_BOX.width * card.scale * UNIT, 6);
      expect(piece.left + piece.width / 2).toBeCloseTo((card.cx - BRAND_SYMBOL_SQUARE.x) * UNIT, 6);
      expect(piece.top + piece.height / 2).toBeCloseTo((card.cy - BRAND_SYMBOL_SQUARE.y) * UNIT, 6);
    });
  });

  it("draws the gap images unstretched at rest, where they are exact", () => {
    const [, halo, center, sideHalo, front] = rest;
    expect(halo.width).toBeCloseTo(center.width, 6);
    expect(sideHalo.width).toBeCloseTo(front.width, 6);
  });

  it("leaves out hidden cards and the gaps of a closed frame", () => {
    const closed = layoutBrandFrame({ ...brandRestFrame(), gap: 0 }, SIZE, COLORS, SURFACE);
    expect(closed.map((p) => p.image)).toEqual(["card", "card", "card"]);
    const frame = brandRestFrame();
    const faded = { ...frame, cards: [{ ...frame.cards[0], opacity: 0 }, ...frame.cards.slice(1)] };
    expect(layoutBrandFrame(faded, SIZE, COLORS, SURFACE).map((p) => p.image)).toEqual([
      "card",
      "halo-side",
      "card",
    ]);
  });

  it("tints a card crossing colors between the two", () => {
    const pieces = layoutBrandFrame(brandMotionFrames.shuffle(0.5), SIZE, COLORS, SURFACE);
    const tints = pieces.filter((p) => p.image === "card").map((p) => p.tint);
    expect(tints.some((t) => t !== COLORS.side && t !== COLORS.center)).toBe(true);
  });
});

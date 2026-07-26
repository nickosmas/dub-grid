import { describe, expect, it } from "vitest";
import { getAvatarTone, getAvatarGradientTone } from "./avatar-tone";

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

const MIN_AA_CONTRAST = 4.5;
const SAMPLE_SEEDS = Array.from({ length: 24 }, (_, i) => `staff-${i}`);

describe("getAvatarTone", () => {
  it("meets WCAG AA contrast between background and text for every seed", () => {
    for (const seed of SAMPLE_SEEDS) {
      const tone = getAvatarTone(seed);
      expect(contrastRatio(tone.backgroundColor, tone.textColor)).toBeGreaterThanOrEqual(
        MIN_AA_CONTRAST,
      );
    }
  });

  it("is deterministic for a given seed", () => {
    expect(getAvatarTone("employee-42")).toEqual(getAvatarTone("employee-42"));
  });
});

describe("getAvatarGradientTone", () => {
  it("meets WCAG AA contrast between both gradient stops and white text for every seed", () => {
    for (const seed of SAMPLE_SEEDS) {
      const tone = getAvatarGradientTone(seed);
      expect(contrastRatio(tone.gradientFrom, tone.textColor)).toBeGreaterThanOrEqual(
        MIN_AA_CONTRAST,
      );
      expect(contrastRatio(tone.gradientTo, tone.textColor)).toBeGreaterThanOrEqual(
        MIN_AA_CONTRAST,
      );
    }
  });

  it("is deterministic for a given seed", () => {
    expect(getAvatarGradientTone("employee-42")).toEqual(getAvatarGradientTone("employee-42"));
  });

  it("derives its gradient 'from' stop from the same identity color as the flat tone", () => {
    const flat = getAvatarTone("employee-7");
    const gradient = getAvatarGradientTone("employee-7");
    expect(gradient.gradientFrom).toBe(flat.textColor);
  });
});

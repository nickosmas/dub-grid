import { describe, expect, it } from "vitest";
import { darkMobileColors, mobileColors } from "./tokens";

/** WCAG 2.1 relative luminance. */
function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast is the one part of visual design this harness can actually verify —
 * the `style` prop is dropped before it reaches the DOM, so nothing else about
 * appearance is assertable. These thresholds exist because borderless controls
 * were shipped at 1.04:1 against the page, which is not a perceivable edge.
 *
 * Two different bars, deliberately:
 *  - **Labels must clear WCAG AA (4.5:1).** This is a real accessibility floor.
 *  - **Fills are held to a "perceivable" 1.10:1.** A light fill on a light page
 *    cannot reach WCAG's 3:1 for non-text UI, and no design system achieves it;
 *    pretending otherwise would mean a test nobody can satisfy. The guarantee
 *    for users is the label ratio above.
 */
const AA_TEXT = 4.5;
const PERCEIVABLE_FILL = 1.1;

describe("light mode control contrast", () => {
  it("separates cards from the page background", () => {
    expect(contrastRatio(mobileColors.surface, mobileColors.background)).toBeGreaterThanOrEqual(
      1.12,
    );
  });

  /**
   * The page is a brand-tinted blue, not a neutral gray. Asserted because the
   * whole point of the value is the tint: a neutral that happened to hit the
   * same contrast ratio would pass the check above while looking wrong.
   */
  it("keeps the page blue rather than gray", () => {
    const [red, green, blue] = [1, 3, 5].map((offset) =>
      parseInt(mobileColors.background.slice(offset, offset + 2), 16),
    );

    expect(blue).toBeGreaterThan(red);
    expect(blue).toBeGreaterThan(green);
  });

  it("keeps soft control fills perceivable on a card and on the page", () => {
    for (const fill of [mobileColors.controlNeutralBg, mobileColors.controlSecondaryBg]) {
      expect(contrastRatio(fill, mobileColors.surface)).toBeGreaterThanOrEqual(1.25);
      expect(contrastRatio(fill, mobileColors.background)).toBeGreaterThanOrEqual(PERCEIVABLE_FILL);
    }
  });

  it("keeps every control label at AA against its own fill", () => {
    expect(
      contrastRatio(mobileColors.textSecondary, mobileColors.controlNeutralBg),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrastRatio(mobileColors.controlSecondaryFg, mobileColors.controlSecondaryBg),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(mobileColors.onBrandText, mobileColors.brand)).toBeGreaterThanOrEqual(
      AA_TEXT,
    );
  });

  // The reason `controlSecondaryFg` exists at all: reusing the standard brand
  // blue on the darkened secondary fill measures ~4.02:1 and fails AA.
  it("would fail AA if the secondary label reused the standard brand blue", () => {
    expect(contrastRatio(mobileColors.brand, mobileColors.controlSecondaryBg)).toBeLessThan(
      AA_TEXT,
    );
  });
});

describe("dark mode control contrast", () => {
  it("keeps soft control fills perceivable against the card surface", () => {
    for (const fill of [darkMobileColors.controlNeutralBg, darkMobileColors.controlSecondaryBg]) {
      expect(contrastRatio(fill, darkMobileColors.surface)).toBeGreaterThanOrEqual(
        PERCEIVABLE_FILL,
      );
    }
  });

  it("keeps every control label at AA against its own fill", () => {
    expect(
      contrastRatio(darkMobileColors.textSecondary, darkMobileColors.controlNeutralBg),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      contrastRatio(darkMobileColors.controlSecondaryFg, darkMobileColors.controlSecondaryBg),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

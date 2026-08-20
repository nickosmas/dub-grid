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
   * The page is a subtle slate gray, not a brand-tinted blue. Asserted because
   * the ratio above says nothing about hue: the earlier blue page (#EAF1FC, a
   * 18-step blue-over-red tint) hit the same separation while making every
   * screen read as a tinted surface instead of white content on neutral chrome.
   *
   * The tint still has to be *there*, just small — the light ramp is slate, and
   * a fully neutral gray goes warm-dead beside the brand. Both fills that share
   * this ground are held to the same window, so a later "let's warm the grays"
   * pass can't split the family.
   */
  it("keeps the page and its neutral fills a subtle slate gray", () => {
    for (const [name, hex] of [
      ["background", mobileColors.background],
      ["controlNeutralBg", mobileColors.controlNeutralBg],
      ["skeletonBase", mobileColors.skeletonBase],
    ] as const) {
      const [red, green, blue] = [1, 3, 5].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );

      // Slate, so cool: blue leads, and green sits between the two.
      expect(blue, `${name} (${hex}) should be slate-tinted`).toBeGreaterThan(red);
      expect(green, `${name} (${hex}) should be slate-tinted`).toBeGreaterThanOrEqual(red);
      // Gray, so barely: the retired blue page ran a 18-step spread.
      expect(blue - red, `${name} (${hex}) should read gray, not blue`).toBeLessThanOrEqual(12);
    }
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

/**
 * `<Button>`'s solid tones, which the checks above never reached: they cover the
 * two *soft* control fills and `brand`, so the four saturated fills a button can
 * take went unasserted, and `warning` shipped a white label on amber-500 at
 * 2.15:1 without anything failing.
 *
 * Each pair is the fill and the label `resolveLabelColor` actually returns for
 * that tone — three white, and `warning` dark on web's amber. Reading the pair
 * from the component's own rule is the point: asserting white against every
 * fill is what let the amber ship. Both themes are checked because the fills
 * are theme-fixed, which is a claim worth holding rather than assuming.
 */
describe("solid button tone contrast", () => {
  const SOLID_TONES = [
    // `primary` labels with `onBrandText` and the other white tones with
    // `textInverse`; both are white, so `textInverse` covers all three.
    ["buttonPrimaryBg", "textInverse"],
    ["buttonDangerBg", "textInverse"],
    ["buttonSuccessBg", "textInverse"],
    ["buttonWarningBg", "buttonWarningFg"],
  ] as const;

  for (const [theme, colors] of [
    ["light", mobileColors],
    ["dark", darkMobileColors],
  ] as const) {
    it(`keeps every solid ${theme} button label at AA against its own fill`, () => {
      for (const [tone, label] of SOLID_TONES) {
        const fill = colors[tone as keyof typeof colors];
        expect(
          contrastRatio(colors[label as keyof typeof colors], fill),
          `${label} on ${tone} (${fill})`,
        ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it(`keeps the solid ${theme} button fills fixed across themes`, () => {
      for (const [tone] of SOLID_TONES) {
        expect(colors[tone as keyof typeof colors]).toBe(mobileColors[tone as keyof typeof colors]);
      }
    });
  }

  /**
   * The reason the `button*Bg` ramp exists apart from the semantic tokens. If a
   * later change points a solid tone back at one of these, the check above
   * catches it — this one records what that change would cost.
   */
  it("would fail AA if the solid tones reused the shared semantic tokens", () => {
    for (const [label, fill] of [
      ["danger", mobileColors.danger],
      ["success", mobileColors.success],
      ["dark success", darkMobileColors.success],
      ["dark brand", darkMobileColors.brand],
    ] as const) {
      expect(contrastRatio(mobileColors.textInverse, fill), label).toBeLessThan(AA_TEXT);
    }
  });

  /**
   * The warning tone is the one that *does* take a semantic token as its fill,
   * to match web's Deactivate button. It can only do that because the label
   * moved: this records both halves, so pointing it back at a white label fails
   * here rather than shipping web's own 2.15:1.
   */
  it("pairs web's amber with a dark label rather than a white one", () => {
    expect(mobileColors.buttonWarningBg).toBe(mobileColors.warning);
    expect(contrastRatio(mobileColors.textInverse, mobileColors.warning)).toBeLessThan(AA_TEXT);
  });
});

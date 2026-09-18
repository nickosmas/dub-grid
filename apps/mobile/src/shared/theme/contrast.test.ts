import { describe, expect, it } from "vitest";
import { getSoftGradientStops } from "@dubgrid/design-tokens";
import {
  HERO_CARD_GRADIENT_DARK,
  HERO_CARD_GRADIENT_LIGHT,
  HERO_COLLABORATOR_BACKGROUND_DARK,
  HERO_COLLABORATOR_BACKGROUND_LIGHT,
  HERO_INVERSE_CHIP_FILL,
} from "../../features/schedule/lib/heroCardTheme";
import { createNumericBadgeToneStyles } from "../components/NumericBadge";
import { darkMobileColors, mobileColors, mobileElevation } from "./tokens";

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

/** `rgba(r, g, b, a)` laid over an opaque hex ground, as the screen composites it. */
function composite(rgba: string, groundHex: string): string {
  const [r, g, b, a] = rgba
    .replace(/rgba?\(|\)/g, "")
    .split(",")
    .map((part) => Number(part.trim()));
  const ground = groundHex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => parseInt(ground.slice(offset, offset + 2), 16));
  const blend = (over: number, under: number) => Math.round(over * a! + under * (1 - a!));
  return `#${[blend(r!, channels[0]!), blend(g!, channels[1]!), blend(b!, channels[2]!)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
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
  /**
   * The light page is white and so is a card, by design — separation moved from
   * fill to shadow. So the thing to hold is no longer a contrast ratio (it is
   * 1:1 on purpose) but that the shadow which replaced it actually exists and
   * is strong enough to draw an edge. Drop the elevation and every card in light
   * mode becomes invisible, which is exactly the regression worth catching.
   */
  it("gives light-mode cards a shadow, since their fill no longer separates them", () => {
    expect(contrastRatio(mobileColors.surface, mobileColors.background)).toBe(1);
    expect(mobileColors.cardBorder).toBe("transparent");

    const shadow = mobileElevation("card", false);
    expect(shadow.boxShadow, "a card with no shadow is invisible on a white page").toBeDefined();

    const layers = shadow.boxShadow ?? [];
    expect(
      layers.length,
      "one soft blur reads as a smudge; the edge needs a tight layer too",
    ).toBeGreaterThanOrEqual(2);

    const alphas = layers.map((layer) =>
      Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(String(layer.color))?.[1] ?? 0),
    );
    expect(Math.max(...alphas)).toBeGreaterThanOrEqual(0.08);
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
  it("keeps the neutral fills a subtle slate gray", () => {
    // `background` is no longer in this list: the page is plain white, so it has
    // no tint to hold. These fills are now the only tinted shapes on that white
    // ground, which makes keeping them in one family matter more, not less.
    for (const [name, hex] of [
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
    // 1.20, down from 1.25, to admit a lighter neutral fill by direction. This
    // is the floor for a control whose fill is its *only* edge — buttons carry
    // no border and no shadow — so it is close to the point where a control
    // stops reading as one at all. Do not lower it again without giving those
    // controls a border or a shadow back.
    for (const fill of [mobileColors.controlNeutralBg, mobileColors.controlSecondaryBg]) {
      expect(contrastRatio(fill, mobileColors.surface)).toBeGreaterThanOrEqual(1.2);
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

/**
 * The staff Home is washed with the aurora gradient, and the hero card is a
 * solid brand gradient. A soft brand fill (`brandSoft`) is the same tint as
 * either ground, which is how the open-shift count pill disappeared, so the
 * chips placed on those grounds use a solid fill or the hero's inverse chip.
 */
describe("brand-tinted ground contrast", () => {
  const NON_TEXT_UI = 3;

  for (const [theme, colors, isDark] of [
    ["light", mobileColors, false],
    ["dark", darkMobileColors, true],
  ] as const) {
    it(`keeps a solid brand count pill and its number readable on the ${theme} aurora`, () => {
      const auroraTop = composite(getSoftGradientStops("aurora", isDark)[0]!, colors.background);
      const pill = createNumericBadgeToneStyles(colors).brand;
      expect(contrastRatio(pill.backgroundColor, auroraTop)).toBeGreaterThanOrEqual(NON_TEXT_UI);
      expect(contrastRatio(pill.color, pill.backgroundColor)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`lifts the inverse chip off every ${theme} hero surface`, () => {
      const gradient = isDark ? HERO_CARD_GRADIENT_DARK : HERO_CARD_GRADIENT_LIGHT;
      const collaborators = isDark
        ? HERO_COLLABORATOR_BACKGROUND_DARK
        : HERO_COLLABORATOR_BACKGROUND_LIGHT;
      for (const ground of [...gradient, collaborators]) {
        expect(
          contrastRatio(composite(HERO_INVERSE_CHIP_FILL, ground), ground),
        ).toBeGreaterThanOrEqual(PERCEIVABLE_FILL);
      }
    });

    // The chips sit in the title row over the gradient's dark start; the pale
    // top-right corner carries no chip label.
    it(`keeps a white chip label at AA where ${theme} hero chips are placed`, () => {
      const gradient = isDark ? HERO_CARD_GRADIENT_DARK : HERO_CARD_GRADIENT_LIGHT;
      for (const ground of [gradient[0], gradient[1]]) {
        const chip = composite(HERO_INVERSE_CHIP_FILL, ground);
        expect(contrastRatio(colors.textInverse, chip), ground).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    // The "+N" overflow disc on the collaborator block: a pale grey disc in
    // light mode, the inverse chip in dark mode where that grey disappeared.
    it(`keeps the ${theme} collaborator overflow disc and its count readable`, () => {
      const block = isDark ? HERO_COLLABORATOR_BACKGROUND_DARK : HERO_COLLABORATOR_BACKGROUND_LIGHT;
      const disc = isDark ? composite(HERO_INVERSE_CHIP_FILL, block) : colors.surfaceSecondary;
      const label = isDark ? colors.textInverse : colors.textMuted;
      expect(contrastRatio(disc, block)).toBeGreaterThanOrEqual(PERCEIVABLE_FILL);
      expect(contrastRatio(label, disc)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`keeps every ${theme} count badge number at AA against its own fill`, () => {
      for (const [tone, style] of Object.entries(createNumericBadgeToneStyles(colors))) {
        if (tone === "onAccent") continue;
        expect(contrastRatio(style.color, style.backgroundColor), tone).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    });
  }
});

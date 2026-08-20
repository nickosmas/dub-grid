import { describe, expect, it } from "vitest";
import { lightColorTokens, darkColorTokens } from "./index";

/**
 * `navActiveBg` is the active-item highlight for the navbar tabs and the app
 * sidebars. It has churned a few times, so these lock in the two properties
 * that make it belong to the palette rather than being a one-off hex:
 * the right tint for its theme, and a lightness that keeps it distinguishable
 * from both the surface behind it and the hover state.
 */

function channels(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [0, 2, 4].map((o) => Number.parseInt(n.slice(o, o + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cool-neutral tint, expressed as how far G and B sit above R. */
function tint(hex: string): { g: number; b: number } {
  const [r, g, b] = channels(hex);
  return { g: g - r, b: b - r };
}

describe("navActiveBg stays consistent with the rest of the palette", () => {
  it("carries the light ramp's slate tint", () => {
    const { g, b } = tint(lightColorTokens.navActiveBg);
    const slate100 = tint(lightColorTokens.surfaceSecondary);
    const slate200 = tint(lightColorTokens.borderSubtle);

    // Not a pure neutral — the whole light ramp is blue-tinted.
    expect(b).toBeGreaterThan(0);
    // And tinted by the amount its position in the ramp calls for.
    expect(g).toBeGreaterThanOrEqual(slate100.g);
    expect(g).toBeLessThanOrEqual(slate200.g);
    expect(b).toBeGreaterThanOrEqual(slate100.b);
    expect(b).toBeLessThanOrEqual(slate200.b);
  });

  it("sits between the hover background and the next step down", () => {
    const active = relativeLuminance(lightColorTokens.navActiveBg);

    // Darker than surfaceSecondary, which is also the nav/sidebar hover
    // background — otherwise active and hover are indistinguishable.
    expect(active).toBeLessThan(relativeLuminance(lightColorTokens.surfaceSecondary));
    // But lighter than borderSubtle, which read as too heavy for a highlight.
    expect(active).toBeGreaterThan(relativeLuminance(lightColorTokens.borderSubtle));
  });

  it("uses the dark ramp's zinc tint and reads as raised", () => {
    const { g, b } = tint(darkColorTokens.navActiveBg);

    // The dark ramp is R=G with B a few points higher.
    expect(g).toBe(0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBe(tint(darkColorTokens.borderSubtle).b);

    // Lifted above the surface it sits on, not dropped below it.
    expect(relativeLuminance(darkColorTokens.navActiveBg)).toBeGreaterThan(
      relativeLuminance(darkColorTokens.surface),
    );
  });
});

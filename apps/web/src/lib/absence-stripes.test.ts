import { describe, expect, it } from "vitest";
import { absenceStripeFill, tintStripeCss } from "./absence-stripes";

describe("absenceStripeFill", () => {
  it("draws an absence in stripes of its own color", () => {
    const fill = absenceStripeFill("#FECACA", false);
    expect(fill.background).toBe(
      "repeating-linear-gradient(135deg, #FECACA 0, #FECACA 6px, #FEE2E2 6px, #FEE2E2 12px) border-box",
    );
    expect(fill.border).toMatch(/^rgba\(/);
  });

  it("uses the dark tints in dark mode", () => {
    expect(absenceStripeFill("#FECACA", true).stripeA).not.toBe("#FECACA");
  });
});

describe("tintStripeCss", () => {
  it("stripes a theme tint with a step toward its ink", () => {
    expect(tintStripeCss("var(--bg)", "var(--ink)")).toBe(
      "repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 12%, var(--bg)) 0, color-mix(in srgb, var(--ink) 12%, var(--bg)) 6px, var(--bg) 6px, var(--bg) 12px) border-box",
    );
  });
});

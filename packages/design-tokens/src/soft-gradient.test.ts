import { describe, expect, it } from "vitest";
import { darkColorTokens, lightColorTokens } from "./index";
import { getSoftGradientCss, getSoftGradientStops, softGradientTokens } from "./soft-gradient";

// The whole premise of a wash is that it resolves to a colour the page already
// has. If a final stop drifts away from its anchor token the gradient stops
// dissolving and starts looking like a panel with a visible edge, which is
// exactly the flat-blue-blob look these exist to avoid.
describe("soft gradient anchors", () => {
  it("resolves brandWash to the page background in both themes", () => {
    expect(getSoftGradientStops("brandWash", false)[2]).toBe(lightColorTokens.background);
    expect(getSoftGradientStops("brandWash", true)[2]).toBe(darkColorTokens.background);
  });

  it("resolves surfaceSheen to the card surface in both themes", () => {
    expect(getSoftGradientStops("surfaceSheen", false)[2]).toBe(lightColorTokens.surface);
    expect(getSoftGradientStops("surfaceSheen", true)[2]).toBe(darkColorTokens.surface);
  });

  it("fades aurora to fully transparent so it can layer over anything", () => {
    expect(getSoftGradientStops("aurora", false)[2]).toContain("0.00");
    expect(getSoftGradientStops("aurora", true)[2]).toContain("0.00");
  });

  it("derives aurora from the theme brand color", () => {
    // #2563EB -> 37,99,235 and #2075FF -> 32,117,255.
    expect(lightColorTokens.brand).toBe("#2563EB");
    expect(darkColorTokens.brand).toBe("#2075FF");
    expect(getSoftGradientStops("aurora", false)[0]).toContain("37,99,235");
    expect(getSoftGradientStops("aurora", true)[0]).toContain("32,117,255");
  });

  it("keeps a stop for every location", () => {
    expect(softGradientTokens.locations).toHaveLength(3);
    for (const kind of ["brandWash", "aurora", "surfaceSheen"] as const) {
      expect(getSoftGradientStops(kind, false)).toHaveLength(3);
      expect(getSoftGradientStops(kind, true)).toHaveLength(3);
    }
  });

  it("renders CSS with percentage stops for the web", () => {
    expect(getSoftGradientCss("brandWash", false)).toBe(
      "linear-gradient(to bottom right, #F1F6FF 0%, #F5F8FD 45%, #F8FAFC 100%)",
    );
  });
});

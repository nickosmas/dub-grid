// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDmSansFonts } from "./logo-grid";

// The checksums assets/fonts/README.md records for @fontsource/dm-sans@5.3.0.
const EXPECTED_SHA256 = {
  400: "38702875fe179437d200e7ba6f7fab4d497ffe48117ef332029b2081751186ad",
  700: "af422a448ac00679a8dbb13532db3616829c5a35b58d3eeea5903ce17ad2e36a",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadDmSansFonts", () => {
  it("reads the bundled fonts without touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fonts = await loadDmSansFonts();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fonts.map((font) => [font.name, font.weight, font.style])).toEqual([
      ["DM Sans", 400, "normal"],
      ["DM Sans", 700, "normal"],
    ]);
    for (const font of fonts) {
      // Satori reads WOFF, not WOFF2.
      expect(font.data.subarray(0, 4).toString("latin1")).toBe("wOFF");
      expect(createHash("sha256").update(font.data).digest("hex")).toBe(
        EXPECTED_SHA256[font.weight],
      );
    }
  });
});

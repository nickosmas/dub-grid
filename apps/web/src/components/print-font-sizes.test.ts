import { describe, expect, it } from "vitest";
import { PRINT_FONT_SIZES, printFontSizeLabel } from "./print-font-sizes";

describe("print font sizes", () => {
  it("steps up clearly from Small to Large", () => {
    const values = PRINT_FONT_SIZES.map((size) => size.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[2] / values[0]).toBeGreaterThanOrEqual(1.5);
  });

  it("names each size it offers, and the nearest one otherwise", () => {
    for (const size of PRINT_FONT_SIZES) expect(printFontSizeLabel(size.value)).toBe(size.label);
    expect(printFontSizeLabel(20)).toBe("Large");
    expect(printFontSizeLabel(6)).toBe("Small");
  });
});

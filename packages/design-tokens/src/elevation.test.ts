import { describe, expect, it } from "vitest";
import { getMobileElevationExtent } from "./elevation";

describe("getMobileElevationExtent", () => {
  it("reaches nowhere for a flat level", () => {
    expect(getMobileElevationExtent("flat", false)).toEqual({ top: 0, bottom: 0, horizontal: 0 });
    expect(getMobileElevationExtent("flat", true)).toEqual({ top: 0, bottom: 0, horizontal: 0 });
  });

  it("follows the widest layer of the light card, which casts downward", () => {
    expect(getMobileElevationExtent("card", false)).toEqual({
      top: 36,
      bottom: 52,
      horizontal: 44,
    });
  });

  it("reads the dark card from its single layer shadow", () => {
    expect(getMobileElevationExtent("card", true)).toEqual({ top: 24, bottom: 32, horizontal: 28 });
  });

  it("stays tight for a raised tile", () => {
    expect(getMobileElevationExtent("raised", false)).toEqual({
      top: 18,
      bottom: 26,
      horizontal: 22,
    });
  });

  it("leans upward for a sheet", () => {
    const extent = getMobileElevationExtent("sheet", false);
    expect(extent.top).toBeGreaterThan(extent.bottom);
  });
});

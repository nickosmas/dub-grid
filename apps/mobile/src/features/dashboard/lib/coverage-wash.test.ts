import { describe, expect, it } from "vitest";
import { buildCoverageWash } from "./coverage-wash";

describe("buildCoverageWash", () => {
  it("is the brand aurora when coverage is not configured", () => {
    expect(buildCoverageWash(null, false)).toEqual(buildCoverageWash(100, false));
    expect(buildCoverageWash(null, true)).toEqual(buildCoverageWash(100, true));
  });

  it("is the brand aurora when coverage is normal: blue says nothing is wrong", () => {
    expect(buildCoverageWash(92, false)).toEqual([
      "rgba(37, 99, 235, 0.22)",
      "rgba(37, 99, 235, 0.08)",
      "rgba(37, 99, 235, 0)",
    ]);
    expect(buildCoverageWash(100, true)?.[0]).toBe("rgba(32, 117, 255, 0.34)");
  });

  it("takes a deep amber at the same alphas when coverage is close", () => {
    expect(buildCoverageWash(75, false)).toEqual([
      "rgba(217, 119, 6, 0.22)",
      "rgba(217, 119, 6, 0.08)",
      "rgba(217, 119, 6, 0)",
    ]);
  });

  it("keeps red red rather than pink: red-700 in light, red-600 in dark", () => {
    expect(buildCoverageWash(40, false)?.[0]).toBe("rgba(185, 28, 28, 0.22)");
    expect(buildCoverageWash(40, true)?.[0]).toBe("rgba(220, 38, 38, 0.34)");
  });
});

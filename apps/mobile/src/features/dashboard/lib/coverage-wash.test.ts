import { describe, expect, it } from "vitest";
import { buildCoverageWash } from "./coverage-wash";

describe("buildCoverageWash", () => {
  it("is absent when coverage is not configured", () => {
    expect(buildCoverageWash(null, false)).toBeNull();
  });

  it("takes a deep coverage hue at the aurora's alphas, running out to clear", () => {
    expect(buildCoverageWash(92, false)).toEqual([
      "rgba(21, 128, 61, 0.14)",
      "rgba(21, 128, 61, 0.05)",
      "rgba(21, 128, 61, 0)",
    ]);
    expect(buildCoverageWash(75, false)?.[0]).toBe("rgba(217, 119, 6, 0.14)");
  });

  it("keeps red red rather than pink: red-700 in light, red-600 in dark", () => {
    expect(buildCoverageWash(40, false)?.[0]).toBe("rgba(185, 28, 28, 0.14)");
    expect(buildCoverageWash(40, true)?.[0]).toBe("rgba(220, 38, 38, 0.22)");
  });
});

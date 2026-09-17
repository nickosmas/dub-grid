import { describe, expect, it } from "vitest";
import { buildCoverageWash } from "./coverage-wash";

const colors = { success: "#16A34A", warning: "#F59E0B", danger: "#EF4444" } as never;

describe("buildCoverageWash", () => {
  it("is absent when coverage is not configured", () => {
    expect(buildCoverageWash(null, colors, false)).toBeNull();
  });

  it("takes the coverage colour at the aurora's alphas, running out to clear", () => {
    expect(buildCoverageWash(92, colors, false)).toEqual([
      "rgba(22, 163, 74, 0.14)",
      "rgba(22, 163, 74, 0.05)",
      "rgba(22, 163, 74, 0)",
    ]);
    expect(buildCoverageWash(75, colors, false)?.[0]).toBe("rgba(245, 158, 11, 0.14)");
    expect(buildCoverageWash(40, colors, true)?.[0]).toBe("rgba(239, 68, 68, 0.22)");
  });
});

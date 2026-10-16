import { describe, expect, it } from "vitest";
import { clampMeterPercent } from "./AnimatedMeterFill";

describe("clampMeterPercent", () => {
  it("keeps a fill inside its track", () => {
    expect(clampMeterPercent(64)).toBe(64);
    expect(clampMeterPercent(-5)).toBe(0);
    expect(clampMeterPercent(140)).toBe(100);
  });

  it("draws an unknown value as empty rather than breaking the layout", () => {
    expect(clampMeterPercent(Number.NaN)).toBe(0);
    expect(clampMeterPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

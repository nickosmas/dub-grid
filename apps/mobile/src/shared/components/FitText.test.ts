import { describe, expect, it } from "vitest";
import { MIN_FIT_SCALE, resolveFitScale } from "./FitText";

describe("resolveFitScale", () => {
  it("keeps the current scale until both widths are known", () => {
    expect(resolveFitScale(null, 100, 1)).toBe(1);
    expect(resolveFitScale(120, null, 1)).toBe(1);
    expect(resolveFitScale(0, 100, 1)).toBe(1);
    expect(resolveFitScale(120, 0, 0.8)).toBe(0.8);
  });

  it("leaves a label that fits alone, with half a point of tolerance", () => {
    expect(resolveFitScale(100, 100, 1)).toBe(1);
    expect(resolveFitScale(100.4, 100, 1)).toBe(1);
    expect(resolveFitScale(100, 80, 0.8)).toBe(0.8);
  });

  it("shrinks by the ratio of slot to natural width", () => {
    expect(resolveFitScale(200, 150, 1)).toBeCloseTo(0.75);
    // From an already shrunk label the ratio is still against the natural width.
    expect(resolveFitScale(200, 100, 0.75)).toBeCloseTo(0.5);
  });

  it("never grows and never goes under the floor", () => {
    expect(resolveFitScale(100, 100, 0.6)).toBe(0.6);
    expect(resolveFitScale(1000, 100, 1)).toBe(MIN_FIT_SCALE);
  });
});

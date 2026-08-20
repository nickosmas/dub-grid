import { describe, expect, it } from "vitest";
import { Extrapolation, interpolate, interpolateColor } from "./reanimated-stub";

// `interpolate` used to return `output[0]` unconditionally. Anything driven off
// a scroll position or press progress then rendered at its *starting* transform
// in tests, so assertions about the moved state passed without testing
// anything. These cases keep the replacement honest.
describe("reanimated-stub interpolate", () => {
  it("interpolates linearly between two stops", () => {
    expect(interpolate(0.5, [0, 1], [0, 100])).toBe(50);
    expect(interpolate(0.25, [0, 1], [0, 100])).toBe(25);
  });

  it("picks the correct span across multiple stops", () => {
    const input = [-390, 0, 390];
    const output = [-117, 0, 117];

    expect(interpolate(-390, input, output)).toBe(-117);
    expect(interpolate(0, input, output)).toBe(0);
    expect(interpolate(195, input, output)).toBe(58.5);
    expect(interpolate(390, input, output)).toBe(117);
  });

  it("extends beyond the range by default", () => {
    expect(interpolate(2, [0, 1], [0, 100])).toBe(200);
    expect(interpolate(-1, [0, 1], [0, 100])).toBe(-100);
  });

  it("clamps to the edge stops when asked", () => {
    expect(interpolate(2, [0, 1], [0, 100], Extrapolation.CLAMP)).toBe(100);
    expect(interpolate(-1, [0, 1], [0, 100], Extrapolation.CLAMP)).toBe(0);
  });

  it("honors per-side extrapolation config", () => {
    const config = {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.EXTEND,
    };

    expect(interpolate(-1, [0, 1], [0, 100], config)).toBe(0);
    expect(interpolate(2, [0, 1], [0, 100], config)).toBe(200);
  });

  it("survives degenerate inputs rather than returning NaN", () => {
    expect(interpolate(5, [1], [42])).toBe(42);
    expect(interpolate(5, [0, 0], [10, 20])).toBe(20);
  });
});

describe("reanimated-stub interpolateColor", () => {
  it("selects the nearest stop", () => {
    const stops = ["#2563EB", "#E2E8F0"];

    expect(interpolateColor(0, [0, 1], stops)).toBe("#2563EB");
    expect(interpolateColor(0.4, [0, 1], stops)).toBe("#2563EB");
    expect(interpolateColor(0.6, [0, 1], stops)).toBe("#E2E8F0");
    expect(interpolateColor(1, [0, 1], stops)).toBe("#E2E8F0");
  });

  it("clamps outside the range", () => {
    const stops = ["#2563EB", "#E2E8F0"];

    expect(interpolateColor(-5, [0, 1], stops)).toBe("#2563EB");
    expect(interpolateColor(5, [0, 1], stops)).toBe("#E2E8F0");
  });
});

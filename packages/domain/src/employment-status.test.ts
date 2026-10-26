import { describe, expect, it } from "vitest";
import { canMarkInactive } from "./employment-status";

describe("canMarkInactive", () => {
  it("allows someone with a focus area", () => {
    expect(canMarkInactive([3])).toBe(true);
  });

  it("refuses someone with no focus area, such as a management-only person", () => {
    expect(canMarkInactive([])).toBe(false);
  });
});

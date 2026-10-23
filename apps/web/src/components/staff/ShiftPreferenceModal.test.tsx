import { describe, expect, it } from "vitest";
import { describeShiftPreference } from "./ShiftPreferenceModal";

describe("describeShiftPreference", () => {
  const names: Record<number, string> = { 2: "Evening Shift", 3: "Night Shift" };

  it("says the mode and the shifts", () => {
    expect(describeShiftPreference({ mode: "only", shiftIds: [2, 3] }, (id) => names[id])).toBe(
      "Only: Evening Shift, Night Shift",
    );
    expect(describeShiftPreference({ mode: "prefers", shiftIds: [2] }, (id) => names[id])).toBe(
      "Prefers: Evening Shift",
    );
  });

  it("is empty without a preference", () => {
    expect(describeShiftPreference(undefined, (id) => names[id])).toBeNull();
  });
});

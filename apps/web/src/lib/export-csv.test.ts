import { describe, expect, it } from "vitest";
import { withRestOfDayAbsence } from "./export-csv";

describe("withRestOfDayAbsence", () => {
  it("puts the absence for the rest of the day after the shifts", () => {
    expect(withRestOfDayAbsence("Day / Evening", "Sick")).toBe("Day / Evening / Sick");
  });

  it("leaves a cell without one unchanged", () => {
    expect(withRestOfDayAbsence("Day", undefined)).toBe("Day");
  });
});

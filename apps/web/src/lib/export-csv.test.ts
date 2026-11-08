import { describe, expect, it } from "vitest";
import { buildScheduleCsv, withOtherFocusAreas, withRestOfDayAbsence } from "./export-csv";

describe("withRestOfDayAbsence", () => {
  it("puts the absence for the rest of the day after the shifts", () => {
    expect(withRestOfDayAbsence("Day / Evening", "Sick")).toBe("Day / Evening / Sick");
  });

  it("leaves a cell without one unchanged", () => {
    expect(withRestOfDayAbsence("Day", undefined)).toBe("Day");
  });
});

describe("buildScheduleCsv", () => {
  it("lists each person's focus areas under the org's word for them", () => {
    const csv = buildScheduleCsv(
      [{ id: "e1", firstName: "Rosa", lastName: "Member", focusAreaIds: [10] }],
      [new Date(2026, 4, 4)],
      () => withOtherFocusAreas("Day Shift", ["West Wing"]),
      { focusAreaColumn: "Wings", focusAreaNameById: new Map([[10, "East Wing"]]) },
    );
    expect(csv.split("\r\n")).toEqual([
      "Employee,Wings,Mon 5/4",
      '"Member, Rosa",East Wing,Day Shift (West Wing)',
    ]);
  });
});

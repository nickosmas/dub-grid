import { describe, expect, it } from "vitest";
import { summarizeSelection } from "./job-placement-summary";

const wings = [
  { id: 1, name: "East" },
  { id: 2, name: "West" },
  { id: 3, name: "North" },
];

describe("summarizeSelection", () => {
  it("says none in the organization's term when nothing is ticked", () => {
    expect(summarizeSelection(wings, [], "wings")).toBe("No wings");
  });

  it("names a single choice", () => {
    expect(summarizeSelection(wings, [2], "wings")).toBe("West");
  });

  it("names a single choice even when it is the only one", () => {
    expect(summarizeSelection([{ id: 1, name: "Nursing" }], [1], "departments")).toBe("Nursing");
  });

  it("says all when every choice is ticked", () => {
    expect(summarizeSelection(wings, [3, 1, 2], "wings")).toBe("All wings");
  });

  it("counts a partial selection", () => {
    expect(summarizeSelection(wings, [1, 3], "wings")).toBe("2 wings");
  });

  it("ignores ids that are no longer choices", () => {
    expect(summarizeSelection(wings, [1, 99], "wings")).toBe("East");
    expect(summarizeSelection(wings, [1, 2, 3, 99], "wings")).toBe("All wings");
  });

  it("counts a name shared by several choices once", () => {
    const shifts = [
      { id: 10, name: "Day" },
      { id: 11, name: "Day" },
      { id: 12, name: "Night" },
      { id: 13, name: "Evening" },
    ];
    expect(summarizeSelection(shifts, [10, 11], "shifts")).toBe("Day");
    expect(summarizeSelection(shifts, [10, 11, 12], "shifts")).toBe("2 shifts");
    expect(summarizeSelection(shifts, [10, 11, 12, 13], "shifts")).toBe("All shifts");
  });
});

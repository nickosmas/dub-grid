import { describe, expect, it } from "vitest";
import { summarizePlacement, summarizeSelection } from "./job-placement-summary";

const wings = [
  { id: 1, name: "East" },
  { id: 2, name: "West" },
  { id: 3, name: "North" },
];

const pick = (selectedIds: number[]) => ({ choices: wings, selectedIds, plural: "wings" });

describe("summarizeSelection", () => {
  it("says none in the organization's term when nothing is ticked", () => {
    expect(summarizeSelection(pick([]))).toBe("No wings");
  });

  it("names a single choice", () => {
    expect(summarizeSelection(pick([2]))).toBe("West");
  });

  it("names a single choice even when it is the only one", () => {
    expect(
      summarizeSelection({
        choices: [{ id: 1, name: "Nursing" }],
        selectedIds: [1],
        plural: "departments",
      }),
    ).toBe("Nursing");
  });

  it("says all when every choice is ticked", () => {
    expect(summarizeSelection(pick([3, 1, 2]))).toBe("All wings");
  });

  it("counts a partial selection", () => {
    expect(summarizeSelection(pick([1, 3]))).toBe("2 wings");
  });

  it("ignores ids that are no longer choices", () => {
    expect(summarizeSelection(pick([1, 99]))).toBe("East");
    expect(summarizeSelection(pick([1, 2, 3, 99]))).toBe("All wings");
  });

  it("counts a name shared by several choices once", () => {
    const shifts = [
      { id: 10, name: "Day" },
      { id: 11, name: "Day" },
      { id: 12, name: "Night" },
      { id: 13, name: "Evening" },
    ];
    const pickShifts = (selectedIds: number[]) => ({
      choices: shifts,
      selectedIds,
      plural: "shifts",
    });
    expect(summarizeSelection(pickShifts([10, 11]))).toBe("Day");
    expect(summarizeSelection(pickShifts([10, 11, 12]))).toBe("2 shifts");
    expect(summarizeSelection(pickShifts([10, 11, 12, 13]))).toBe("All shifts");
  });
});

describe("summarizePlacement", () => {
  const departments = { choices: [{ id: 1, name: "Nursing" }], plural: "departments" };
  const shifts = {
    choices: [
      { id: 10, name: "Day" },
      { id: 11, name: "Night" },
    ],
    plural: "shifts",
  };

  it("joins every level when each has a choice", () => {
    expect(
      summarizePlacement([
        { ...departments, selectedIds: [1] },
        pick([1, 2]),
        { ...shifts, selectedIds: [10, 11] },
      ]),
    ).toBe("Nursing · 2 wings · All shifts");
  });

  it("stops at the first empty level", () => {
    expect(
      summarizePlacement([
        { ...departments, selectedIds: [1] },
        pick([]),
        { ...shifts, selectedIds: [] },
      ]),
    ).toBe("Nursing · No wings");
  });

  it("says not placed when nothing is chosen", () => {
    expect(
      summarizePlacement([
        { ...departments, selectedIds: [] },
        pick([]),
        { ...shifts, selectedIds: [] },
      ]),
    ).toBe("Not placed yet");
  });
});

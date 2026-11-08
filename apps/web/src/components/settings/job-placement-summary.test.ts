import { describe, expect, it } from "vitest";
import { namesForIds, summarizeNames } from "./job-placement-summary";

describe("summarizeNames", () => {
  it("names up to three items", () => {
    expect(summarizeNames(["Nursing"], "departments")).toBe("Nursing");
    expect(summarizeNames(["East", "West", "North"], "wings")).toBe("East, West, North");
  });

  it("counts the rest past three", () => {
    expect(summarizeNames(["Day", "Evening", "Night", "Day 12h", "Night 12h"], "shifts")).toBe(
      "Day, Evening, Night +2",
    );
  });

  it("says none in the organization's term when empty", () => {
    expect(summarizeNames([], "wings")).toBe("No wings");
  });
});

describe("namesForIds", () => {
  const items = [
    { id: 3, name: "North" },
    { id: 1, name: "East" },
    { id: 2, name: "West" },
  ];

  it("keeps the items' order, not the ids'", () => {
    expect(namesForIds(items, [2, 3])).toEqual(["North", "West"]);
  });

  it("skips ids that are no longer listed", () => {
    expect(namesForIds(items, [1, 99])).toEqual(["East"]);
  });

  it("lists a name shared by several items once", () => {
    const shifts = [
      { id: 10, name: "Day" },
      { id: 11, name: "Day" },
      { id: 12, name: "Night" },
    ];
    expect(namesForIds(shifts, [10, 11, 12])).toEqual(["Day", "Night"]);
  });
});

import { describe, expect, it } from "vitest";

import { absenceSideOf, joinAbsenceBesideShifts } from "./absence-side";

describe("absenceSideOf", () => {
  const day = { start: "07:00", end: "15:00" };

  it("reads an absence ending where (or before) the work starts as arrived late", () => {
    expect(absenceSideOf({ start: "07:00", end: "11:00" }, { start: "11:00", end: "15:00" })).toBe(
      "arrived-late",
    );
    expect(absenceSideOf({ start: "07:00", end: "15:00" }, { start: "16:00", end: "23:00" })).toBe(
      "arrived-late",
    );
  });

  it("reads one starting in or after the work, or none, as left early", () => {
    expect(absenceSideOf({ start: "11:00", end: "15:00" }, day)).toBe("left-early");
    expect(absenceSideOf({ start: "16:00", end: "20:00" }, day)).toBe("left-early");
    expect(absenceSideOf({ start: "19:00", end: "23:00" }, { start: "07:00", end: "19:00" })).toBe(
      "left-early",
    );
    expect(absenceSideOf({ start: "03:00", end: "07:00" }, { start: "23:00", end: "03:00" })).toBe(
      "left-early",
    );
    expect(absenceSideOf(null, day)).toBe("left-early");
  });
});

describe("joinAbsenceBesideShifts", () => {
  it("puts a timed absence after the shift, or first when they arrived late", () => {
    const day = { start: "07:00", end: "15:00" };
    expect(joinAbsenceBesideShifts("Day", "Sick", { start: "11:00", end: "15:00" }, day)).toBe(
      "Day / Sick 11:00 AM - 3:00 PM",
    );
    expect(
      joinAbsenceBesideShifts(
        "Day",
        "PTO",
        { start: "07:00", end: "11:00" },
        { start: "11:00", end: "15:00" },
      ),
    ).toBe("PTO 7:00 AM - 11:00 AM / Day");
    expect(joinAbsenceBesideShifts("Day", "Sick", null, day)).toBe("Day / Sick");
  });
});

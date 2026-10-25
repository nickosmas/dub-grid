import { describe, expect, it } from "vitest";
import { formatShiftWindow, secondShiftClash, type WorkingShift } from "./shift-picker-groups";

const DAY: WorkingShift = { name: "Day", shiftId: 1, start: "07:00", end: "15:00" };

describe("formatShiftWindow", () => {
  it("reads in 12-hour time", () => {
    expect(formatShiftWindow("07:00", "15:00", "2026-10-29")).toBe("7:00 AM - 3:00 PM");
  });

  it("names both days when the shift crosses midnight", () => {
    expect(formatShiftWindow("23:00", "07:00", "2026-10-29")).toBe("Thu 11:00 PM - Fri 7:00 AM");
  });

  it("is null without both times", () => {
    expect(formatShiftWindow(null, "15:00", "2026-10-29")).toBeNull();
  });
});

describe("secondShiftClash", () => {
  it("refuses the shift already worked", () => {
    expect(secondShiftClash({ shiftId: 1, startTime: "07:00", endTime: "15:00" }, DAY, null)).toBe(
      "Already working this shift",
    );
  });

  it("refuses a shift that overlaps, naming the worked times", () => {
    expect(
      secondShiftClash({ shiftId: 2, startTime: "07:00:00", endTime: "19:00:00" }, DAY, null),
    ).toBe("Overlaps 7:00 AM - 3:00 PM");
  });

  it("lets a shift that starts when the first ends fit", () => {
    expect(
      secondShiftClash({ shiftId: 3, startTime: "15:00", endTime: "23:00" }, DAY, null),
    ).toBeNull();
  });

  it("lets a night shift follow an early shift, since its morning is the next day's", () => {
    const early: WorkingShift = { name: "Early", shiftId: 5, start: "05:00", end: "13:00" };
    expect(
      secondShiftClash({ shiftId: 4, startTime: "23:00", endTime: "07:00" }, early, "2026-10-26"),
    ).toBeNull();
    const night: WorkingShift = { name: "Night", shiftId: 4, start: "23:00", end: "07:00" };
    expect(
      secondShiftClash({ shiftId: 5, startTime: "05:00", endTime: "13:00" }, night, "2026-10-26"),
    ).toBeNull();
  });

  it("catches an overnight shift reaching back into the day", () => {
    const evening: WorkingShift = { name: "Evening", shiftId: 3, start: "15:00", end: "23:00" };
    expect(
      secondShiftClash({ shiftId: 4, startTime: "22:00", endTime: "06:00" }, evening, "2026-10-29"),
    ).toBe("Overlaps 3:00 PM - 11:00 PM");
  });

  it("lets a shift without set times fit", () => {
    expect(secondShiftClash({ shiftId: 5, startTime: null, endTime: null }, DAY, null)).toBeNull();
  });
});

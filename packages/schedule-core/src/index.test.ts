import { describe, expect, it } from "vitest";
import {
  buildWeeklyHoursSummary,
  formatShiftClockChange,
  getShiftClockChange,
  getFeaturedMeScheduleSegment,
  getSegmentScheduledMinutes,
  getScheduleMonthWeekIndexForDate,
  hasShiftStartedAtTimeRanges,
} from "./index";
import type { ScheduleEntryLike } from "./types";

describe("hasShiftStartedAtTimeRanges", () => {
  // 2026-05-14, 14:30 UTC
  const now = new Date("2026-05-14T14:30:00Z");
  const timeZone = "UTC";

  it("returns false when the shift date has no value", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: null,
        timeRanges: [{ start: "07:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  it("treats a past-dated shift as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-13",
        timeRanges: [{ start: "23:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a future-dated shift as not started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-15",
        timeRanges: [{ start: "01:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  it("treats a same-day shift past its start time as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "07:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a same-day shift before its start time as not started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "15:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  // Regression: a single-digit hour ("7:00") must not be string-compared
  // against the zero-padded current time ("14:30") — "14:30" < "7:00"
  // lexically, which previously left already-started shifts visible.
  it("handles unpadded single-digit hour start times", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "7:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "9:30" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  // Regression: the earliest start must be picked numerically, not by
  // lexical string sort (which would rank "15:00" before "7:00").
  it("uses the numerically earliest range start", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "15:00" }, { start: "7:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a same-day shift with no resolvable times as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [],
        now,
        timeZone,
      }),
    ).toBe(true);
  });
});

describe("getFeaturedMeScheduleSegment", () => {
  const todayDate = "2026-05-14";

  const endedTodayEntry: ScheduleEntryLike = {
    employeeId: "emp-1",
    employeeName: "Jordan Lee",
    date: todayDate,
    shiftName: "Night Shift",
    startTime: "00:00",
    endTime: "08:00",
    absenceTypeId: null,
  };

  // Regression: a shift today that already ended must still surface as the
  // featured item, not be treated as "nothing scheduled" just because there's
  // no active/upcoming/away item today and no shift on a later day.
  it("surfaces an already-ended shift today instead of reporting empty", () => {
    const result = getFeaturedMeScheduleSegment({
      currentTime: "20:06",
      entries: [endedTodayEntry],
      rangeStartDate: "2026-05-10",
      selectedDate: todayDate,
      todayDate,
    });

    expect(result.status).toBe("scheduled");
    expect(result.item?.date).toBe(todayDate);
  });

  it("reports empty when there are truly no entries for the week", () => {
    const result = getFeaturedMeScheduleSegment({
      currentTime: "20:06",
      entries: [],
      rangeStartDate: "2026-05-10",
      selectedDate: todayDate,
      todayDate,
    });

    expect(result.status).toBe("empty");
    expect(result.item).toBeNull();
  });

  it("features the first absence of a future week that holds nothing else", () => {
    const result = getFeaturedMeScheduleSegment({
      currentTime: "09:00",
      entries: [
        {
          employeeId: "emp-1",
          employeeName: "Jordan Lee",
          date: "2026-05-19",
          shiftName: "Vacation",
          startTime: null,
          endTime: null,
          absenceTypeId: 3,
        },
      ],
      rangeStartDate: "2026-05-17",
      selectedDate: "2026-05-17",
      todayDate,
    });

    expect(result.status).toBe("away");
    expect(result.item?.date).toBe("2026-05-19");
  });

  it("keeps last night's overnight shift on duty until it ends, and tonight's out of it", () => {
    const overnight = (date: string): ScheduleEntryLike => ({
      employeeId: "emp-1",
      employeeName: "Jordan Lee",
      date,
      shiftName: "Night Shift",
      startTime: "22:00",
      endTime: "06:00",
      absenceTypeId: null,
    });
    const stillRunning = getFeaturedMeScheduleSegment({
      currentTime: "02:00",
      entries: [overnight("2026-05-13"), overnight(todayDate)],
      rangeStartDate: "2026-05-10",
      selectedDate: todayDate,
      todayDate,
    });
    expect(stillRunning.status).toBe("active");
    expect(stillRunning.item?.date).toBe("2026-05-13");

    const tonightNotYet = getFeaturedMeScheduleSegment({
      currentTime: "02:00",
      entries: [overnight(todayDate)],
      rangeStartDate: "2026-05-10",
      selectedDate: todayDate,
      todayDate,
    });
    expect(tonightNotYet.status).toBe("upcoming");
  });

  it("does not call a finished shift upcoming when browsing an earlier day", () => {
    const result = getFeaturedMeScheduleSegment({
      currentTime: "09:00",
      entries: [{ ...endedTodayEntry, date: "2026-05-12" }],
      rangeStartDate: "2026-05-10",
      selectedDate: "2026-05-11",
      todayDate,
    });

    expect(result.status).toBe("scheduled");
    expect(result.item?.date).toBe("2026-05-12");
  });

  it("does not feature a future deleted publication as an upcoming shift", () => {
    const result = getFeaturedMeScheduleSegment({
      currentTime: "20:06",
      entries: [
        {
          ...endedTodayEntry,
          date: "2026-05-16",
          change: { kind: "deleted", previousPresentation: null },
        },
      ],
      rangeStartDate: "2026-05-10",
      selectedDate: todayDate,
      todayDate,
    });

    expect(result).toEqual({ status: "empty", item: null });
  });
});

describe("getScheduleMonthWeekIndexForDate", () => {
  // May 2026: May 1 is a Friday, so the grid's first row starts Sun Apr 26.
  it("returns 0 for the month's start date", () => {
    expect(getScheduleMonthWeekIndexForDate("2026-05-01", "2026-05-01")).toBe(0);
  });

  it("returns 0 for a leading day from the previous month in the first grid row", () => {
    expect(getScheduleMonthWeekIndexForDate("2026-05-01", "2026-04-27")).toBe(0);
  });

  it("returns the correct row for a date later in the month", () => {
    // 2026-05-14 falls in the grid row starting 2026-05-10 (row index 2).
    expect(getScheduleMonthWeekIndexForDate("2026-05-01", "2026-05-14")).toBe(2);
  });
});

describe("hours across a DST change", () => {
  const NEW_YORK = "America/New_York";
  const night = (overrides: Partial<ScheduleEntryLike> = {}): ScheduleEntryLike => ({
    employeeId: "emp-1",
    employeeName: "Jordan Lee",
    date: "2026-10-31",
    shiftName: "Night Shift",
    startTime: "23:00",
    endTime: "07:00",
    absenceTypeId: null,
    ...overrides,
  });

  it("counts the fall-back night's repeated hour in a segment", () => {
    const segment = { startTime: "23:00", endTime: "07:00" };
    expect(getSegmentScheduledMinutes(night(), segment, null, null, NEW_YORK)).toBe(9 * 60);
    expect(getSegmentScheduledMinutes(night(), segment)).toBe(8 * 60);
  });

  it("totals a week with the real hours of a night across the change", () => {
    const entries = [night({ customStartTime: "23:00", customEndTime: "07:00", segments: [] })];
    expect(buildWeeklyHoursSummary(entries, 40, NEW_YORK).scheduledHours).toBe(9);
    expect(buildWeeklyHoursSummary(entries, 40).scheduledHours).toBe(8);
  });
});

describe("getShiftClockChange", () => {
  const LA = "America/Los_Angeles";

  it("names the hour the clocks move during a night across a change", () => {
    expect(getShiftClockChange("23:00", "07:00", { date: "2026-10-31", timeZone: LA })).toBe(60);
    expect(getShiftClockChange("23:00", "07:00", { date: "2026-03-07", timeZone: LA })).toBe(-60);
    expect(formatShiftClockChange(60)).toBe("clocks go back 1 hour");
    expect(formatShiftClockChange(-60)).toBe("clocks go forward 1 hour");
    expect(formatShiftClockChange(30)).toBe("clocks go back 30 minutes");
  });

  it("is null when the clocks don't move or the shift has no times", () => {
    expect(getShiftClockChange("07:00", "15:00", { date: "2026-11-01", timeZone: LA })).toBeNull();
    expect(getShiftClockChange("23:00", "07:00", { date: "2026-06-13", timeZone: LA })).toBeNull();
    expect(
      getShiftClockChange("23:00", "07:00", { date: "2026-10-31", timeZone: null }),
    ).toBeNull();
    expect(getShiftClockChange(null, "07:00", { date: "2026-10-31", timeZone: LA })).toBeNull();
  });
});

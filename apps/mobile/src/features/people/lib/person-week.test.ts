import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import { buildPersonWeek, buildWorkingWithYou, formatWeekDay } from "./person-week";

type Segment = MobileScheduleEntry["presentation"]["segments"][number];

function segment(shiftId: number, shiftName: string, start: string, end: string): Segment {
  return {
    shiftId,
    jobId: 1,
    shiftName,
    shiftStartTime: start,
    shiftEndTime: end,
    startTime: start,
    endTime: end,
    focusAreaId: 2,
    displayFocusAreaName: "3 East",
  };
}

const DAY = segment(1, "Day Shift", "07:00:00", "15:00:00");
const EVENING = segment(2, "Evening Shift", "15:00:00", "23:00:00");

function entry(employeeId: string, date: string, shift: Segment | null): MobileScheduleEntry {
  return {
    employeeId,
    employeeName: employeeId,
    employeeFocusAreaIds: [2],
    date,
    state: shift
      ? {
          kind: "worked",
          segments: [{ shiftId: shift.shiftId ?? null, jobId: 1, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        }
      : { kind: "absence", absenceTypeId: 9, seriesId: null, fromRecurring: false },
    presentation: {
      label: shift ? "D" : "Sick",
      shiftName: shift?.shiftName ?? null,
      focusAreaId: 2,
      focusAreaName: "3 East",
      displayFocusAreaName: "3 East",
      startTime: shift?.startTime ?? null,
      endTime: shift?.endTime ?? null,
      segments: shift ? [shift] : [],
    },
    change: null,
    publishedAt: "2026-11-14T18:30:00.000Z",
    publishedByName: null,
    indicators: [],
  } as MobileScheduleEntry;
}

const WEEK = "2026-11-15";

describe("formatWeekDay", () => {
  it("names the weekday and the day of the month", () => {
    expect(formatWeekDay("2026-11-16")).toBe("Mon 16");
  });
});

describe("buildPersonWeek", () => {
  it("lists every day of the week with the shift, the absence or a day off", () => {
    const week = buildPersonWeek(
      [
        entry("priya", "2026-11-16", DAY),
        entry("priya", "2026-11-17", null),
        entry("lena", "2026-11-18", DAY),
      ],
      "priya",
      WEEK,
    );
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-11-15", label: "Sun 15", shift: null });
    expect(week[1]).toEqual({
      date: "2026-11-16",
      label: "Mon 16",
      shift: "Day Shift · 7:00 AM - 3:00 PM",
    });
    expect(week[2]?.shift).toBe("Sick");
    expect(week[3]?.shift).toBeNull();
  });
});

describe("buildWorkingWithYou", () => {
  it("names the days the two work the same shift", () => {
    const entries = [
      entry("me", "2026-11-16", DAY),
      entry("priya", "2026-11-16", DAY),
      entry("me", "2026-11-17", DAY),
      entry("priya", "2026-11-17", EVENING),
      entry("me", "2026-11-18", null),
      entry("priya", "2026-11-18", DAY),
      entry("me", "2026-11-19", DAY),
      entry("priya", "2026-11-19", DAY),
    ];
    expect(
      buildWorkingWithYou(entries, { personId: "priya", viewerId: "me", weekStart: WEEK }),
    ).toEqual(["Mon Day Shift", "Thu Day Shift"]);
  });

  it("is empty on your own page", () => {
    expect(
      buildWorkingWithYou([entry("me", "2026-11-16", DAY)], {
        personId: "me",
        viewerId: "me",
        weekStart: WEEK,
      }),
    ).toEqual([]);
  });
});

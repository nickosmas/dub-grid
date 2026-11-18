import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import { buildDayRoster } from "./day-roster";

type Segment = MobileScheduleEntry["presentation"]["segments"][number];

function segment(shiftId: number, shiftName: string, startTime: string, endTime: string): Segment {
  return {
    shiftId,
    jobId: 1,
    shiftName,
    shiftStartTime: startTime,
    shiftEndTime: endTime,
    startTime,
    endTime,
    focusAreaId: 2,
    displayFocusAreaName: "ICU",
  };
}

const DAY = segment(1, "Day Shift", "07:00:00", "15:00:00");
const EVENING = segment(2, "Evening Shift", "15:00:00", "23:00:00");

function entry(
  employeeName: string,
  shift: Segment | null,
  date = "2026-11-19",
): MobileScheduleEntry {
  const segments = shift ? [shift] : [];
  return {
    employeeId: `emp-${employeeName}`,
    employeeName,
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
      focusAreaName: "ICU",
      displayFocusAreaName: "ICU",
      startTime: shift?.startTime ?? null,
      endTime: shift?.endTime ?? null,
      segments,
    },
    change: null,
    publishedAt: "2026-11-15T18:30:00.000Z",
    publishedByName: "Mina Diaz",
    indicators: [],
  } as MobileScheduleEntry;
}

describe("buildDayRoster", () => {
  it("groups the day's worked shifts with who works them, in shift order", () => {
    const roster = buildDayRoster(
      [
        entry("Grace Kim", EVENING),
        entry("Lena Novak", DAY),
        entry("Priya Patel", DAY),
        entry("Sam Rivera", DAY, "2026-11-20"),
      ],
      "2026-11-19",
    );
    expect(roster.map((shift) => [shift.title, shift.names])).toEqual([
      ["Day Shift", ["Lena Novak", "Priya Patel"]],
      ["Evening Shift", ["Grace Kim"]],
    ]);
    expect(roster[0]?.time).toBeTruthy();
  });

  it("leaves out absences and is empty for a day with no shifts", () => {
    expect(buildDayRoster([entry("Marcus Lee", null)], "2026-11-19")).toEqual([]);
    expect(buildDayRoster([], "2026-11-19")).toEqual([]);
  });
});

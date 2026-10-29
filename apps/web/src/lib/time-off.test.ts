import { describe, expect, it } from "vitest";
import { buildTimeOff, findNextTimeOff, type TimeOffPerson } from "./time-off";
import type { AbsenceType, ShiftMap } from "@/types";

const absences = new Map<number, AbsenceType>([
  [1, { id: 1, name: "Vacation", label: "V" } as AbsenceType],
  [2, { id: 2, name: "Sick", label: "S" } as AbsenceType],
  [9, { id: 9, name: "Off", label: "X" } as AbsenceType],
]);
const active: TimeOffPerson = { id: "emp", status: "active", statusChangedAt: null };
const TODAY = "2026-10-29";
const RANGE = { startDate: "2026-10-01", endDate: "2026-12-31" };

const off = (absenceTypeId: number) =>
  ({ assignmentIds: [], absenceTypeId, isDelete: false }) as unknown as ShiftMap[string];
const days = (from: string, count: number, absenceTypeId: number): ShiftMap => {
  const shifts: ShiftMap = {};
  for (let i = 0; i < count; i++) {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    shifts[`emp_${date.toISOString().slice(0, 10)}`] = off(absenceTypeId);
  }
  return shifts;
};

describe("buildTimeOff", () => {
  it("groups days in a row into one entry with its day count and state", () => {
    const entries = buildTimeOff(
      active,
      { ...days("2026-12-22", 5, 1), ...days("2026-10-05", 1, 2) },
      RANGE,
      TODAY,
      absences,
    );
    expect(entries).toEqual([
      expect.objectContaining({
        name: "Vacation",
        startDate: "2026-12-22",
        endDate: "2026-12-26",
        days: 5,
        state: "planned",
      }),
      expect.objectContaining({ name: "Sick", startDate: "2026-10-05", days: 1, state: "taken" }),
    ]);
  });

  it("breaks a run at a different absence or a gap", () => {
    const entries = buildTimeOff(
      active,
      { ...days("2026-10-05", 2, 1), ...days("2026-10-07", 1, 2), ...days("2026-10-09", 1, 1) },
      RANGE,
      TODAY,
      absences,
    );
    expect(entries.map((entry) => `${entry.name} ${entry.days}`)).toEqual([
      "Vacation 1",
      "Sick 1",
      "Vacation 2",
    ]);
  });

  it("leaves out the day off absence unless asked", () => {
    const shifts = days("2026-10-10", 2, 9);
    expect(
      buildTimeOff(active, shifts, RANGE, TODAY, absences, { dayOffAbsenceTypeId: 9 }),
    ).toEqual([]);
    expect(
      buildTimeOff(active, shifts, RANGE, TODAY, absences, {
        dayOffAbsenceTypeId: 9,
        includeDayOff: true,
      }),
    ).toHaveLength(1);
  });

  it("names part of a day with the time it covers", () => {
    const shifts = {
      "emp_2026-10-27": {
        assignmentIds: [1],
        restOfDayAbsenceTypeId: 2,
        restOfDayAbsenceStartTime: "11:00",
        restOfDayAbsenceEndTime: "15:00",
      } as unknown as ShiftMap[string],
    };
    expect(buildTimeOff(active, shifts, RANGE, TODAY, absences)).toEqual([
      expect.objectContaining({
        name: "Sick",
        detail: "11:00 AM - 3:00 PM, not worked",
        days: null,
        state: "taken",
      }),
    ]);
  });

  it("shows time away now and planned, without its absence days twice", () => {
    const away: TimeOffPerson = {
      id: "emp",
      status: "inactive",
      statusChangedAt: "2026-10-20T15:00:00Z",
      awayUntil: "2026-11-30",
      awayAbsenceTypeId: 1,
      plannedStatus: null,
    };
    const entries = buildTimeOff(away, days("2026-10-20", 10, 1), RANGE, TODAY, absences);
    expect(entries).toEqual([
      expect.objectContaining({
        kind: "away",
        name: "Away",
        detail: "Vacation",
        startDate: "2026-10-20",
        endDate: "2026-11-29",
        days: 41,
        state: "now",
      }),
    ]);

    const planned: TimeOffPerson = {
      ...active,
      plannedStatus: "inactive",
      plannedFrom: "2026-11-10",
      plannedUntil: null,
    };
    expect(buildTimeOff(planned, {}, RANGE, TODAY, absences)[0]).toMatchObject({
      kind: "away",
      startDate: "2026-11-10",
      days: null,
      state: "planned",
    });
  });
});

describe("findNextTimeOff", () => {
  it("picks the earliest planned entry", () => {
    const entries = buildTimeOff(
      active,
      { ...days("2026-12-22", 2, 1), ...days("2026-11-03", 1, 2), ...days("2026-10-02", 1, 2) },
      RANGE,
      TODAY,
      absences,
    );
    expect(findNextTimeOff(entries)).toMatchObject({ name: "Sick", startDate: "2026-11-03" });
    expect(findNextTimeOff([])).toBeNull();
  });
});

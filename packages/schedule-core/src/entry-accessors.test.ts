import { describe, expect, it } from "vitest";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryRestOfDayAbsenceTimes,
  getScheduleEntryRestOfDayAbsenceTypeId,
} from "./entry-accessors";
import type { ScheduleEntryLike } from "./types";

function entryWithState(
  kind: "worked" | "absence",
  absenceTypeId: number | null,
  times: { absenceStartTime?: string | null; absenceEndTime?: string | null } = {},
) {
  return {
    state: {
      kind,
      segments: kind === "worked" ? [{ shiftId: 1, jobId: 10, position: 0 }] : [],
      absenceTypeId,
      customStartTime: null,
      customEndTime: null,
      ...times,
      seriesId: null,
      fromRecurring: false,
    },
  } as unknown as ScheduleEntryLike;
}

describe("rest-of-day absence accessors (item 45)", () => {
  it("reads the rest-of-day absence of a worked cell, which is not a whole-day absence", () => {
    const entry = entryWithState("worked", 7);
    expect(getScheduleEntryRestOfDayAbsenceTypeId(entry)).toBe(7);
    expect(getScheduleEntryAbsenceTypeId(entry)).toBeNull();
  });

  it("reads a whole-day absence as an absence, not a rest-of-day one", () => {
    const entry = entryWithState("absence", 7);
    expect(getScheduleEntryAbsenceTypeId(entry)).toBe(7);
    expect(getScheduleEntryRestOfDayAbsenceTypeId(entry)).toBeNull();
  });

  it("has no rest-of-day absence without state or on a plain worked cell", () => {
    expect(
      getScheduleEntryRestOfDayAbsenceTypeId({ absenceTypeId: 7 } as unknown as ScheduleEntryLike),
    ).toBeNull();
    expect(getScheduleEntryRestOfDayAbsenceTypeId(entryWithState("worked", null))).toBeNull();
  });
});

describe("rest-of-day absence times (item 50b)", () => {
  it("reads the time an absence beside a shift covers", () => {
    const entry = entryWithState("worked", 7, {
      absenceStartTime: "07:00",
      absenceEndTime: "11:00",
    });
    expect(getScheduleEntryRestOfDayAbsenceTimes(entry)).toEqual({ start: "07:00", end: "11:00" });
  });

  it("has no times for an untimed absence, a whole-day absence, or a plain shift", () => {
    expect(getScheduleEntryRestOfDayAbsenceTimes(entryWithState("worked", 7))).toBeNull();
    expect(
      getScheduleEntryRestOfDayAbsenceTimes(
        entryWithState("absence", 7, { absenceStartTime: "07:00", absenceEndTime: "11:00" }),
      ),
    ).toBeNull();
    expect(
      getScheduleEntryRestOfDayAbsenceTimes(
        entryWithState("worked", null, { absenceStartTime: "07:00", absenceEndTime: "11:00" }),
      ),
    ).toBeNull();
  });
});

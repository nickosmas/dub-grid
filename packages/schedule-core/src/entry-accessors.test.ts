import { describe, expect, it } from "vitest";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryRestOfDayAbsenceTypeId,
} from "./entry-accessors";
import type { ScheduleEntryLike } from "./types";

function entryWithState(kind: "worked" | "absence", absenceTypeId: number | null) {
  return {
    state: {
      kind,
      segments: kind === "worked" ? [{ shiftId: 1, jobId: 10, position: 0 }] : [],
      absenceTypeId,
      customStartTime: null,
      customEndTime: null,
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

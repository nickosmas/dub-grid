import { describe, expect, it } from "vitest";
import {
  getScheduleEntryAbsenceTypeId,
  getScheduleEntryOffDayAbsenceTypeId,
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

describe("off-day accessors (item 45)", () => {
  it("reads the off day of a worked cell, which is not a whole-day absence", () => {
    const entry = entryWithState("worked", 7);
    expect(getScheduleEntryOffDayAbsenceTypeId(entry)).toBe(7);
    expect(getScheduleEntryAbsenceTypeId(entry)).toBeNull();
  });

  it("reads a whole-day absence as an absence, not an off day", () => {
    const entry = entryWithState("absence", 7);
    expect(getScheduleEntryAbsenceTypeId(entry)).toBe(7);
    expect(getScheduleEntryOffDayAbsenceTypeId(entry)).toBeNull();
  });

  it("has no off day without state or on a plain worked cell", () => {
    expect(
      getScheduleEntryOffDayAbsenceTypeId({ absenceTypeId: 7 } as unknown as ScheduleEntryLike),
    ).toBeNull();
    expect(getScheduleEntryOffDayAbsenceTypeId(entryWithState("worked", null))).toBeNull();
  });
});

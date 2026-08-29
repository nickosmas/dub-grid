import { describe, expect, it } from "vitest";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { getShiftHeroStatus, getShiftHeroStatusLabel, toHeroTimingStatus } from "./heroCardTheme";

function makeEntry(overrides: Record<string, unknown> = {}): MobileScheduleEntry {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Kim",
    date: "2026-04-16",
    assignmentIds: [1],
    shiftLabel: "D",
    assignmentLabel: "D",
    shiftName: "Day Shift",
    absenceTypeId: null,
    focusAreaId: 1,
    focusAreaName: "ICU",
    displayFocusAreaName: "ICU",
    startTime: "07:00:00",
    endTime: "15:00:00",
    customStartTime: null,
    customEndTime: null,
    ...overrides,
  } as unknown as MobileScheduleEntry;
}

describe("getShiftHeroStatus", () => {
  it("is upcoming before the shift starts", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry(),
        startTime: "07:00:00",
        endTime: "15:00:00",
        currentDate: "2026-04-16",
        currentTime: "06:30:00",
      }),
    ).toBe("upcoming");
  });

  it("is active between the start and end times", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry(),
        startTime: "07:00:00",
        endTime: "15:00:00",
        currentDate: "2026-04-16",
        currentTime: "12:00:00",
      }),
    ).toBe("active");
  });

  it("is completed once the shift has ended", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry(),
        startTime: "07:00:00",
        endTime: "15:00:00",
        currentDate: "2026-04-16",
        currentTime: "15:00:00",
      }),
    ).toBe("completed");
  });

  it("keeps an overnight shift active past midnight", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry({ startTime: "22:00:00", endTime: "06:00:00" }),
        startTime: "22:00:00",
        endTime: "06:00:00",
        currentDate: "2026-04-17",
        currentTime: "02:00:00",
      }),
    ).toBe("active");
  });

  it("reports an absence as away regardless of the clock", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry({ absenceTypeId: 1 }),
        startTime: "07:00:00",
        endTime: "15:00:00",
        currentDate: "2026-04-16",
        currentTime: "12:00:00",
      }),
    ).toBe("away");
  });

  it("falls back to the date when the shift carries no times", () => {
    expect(
      getShiftHeroStatus({
        entry: makeEntry({ startTime: null, endTime: null }),
        startTime: null,
        endTime: null,
        currentDate: "2026-04-15",
        currentTime: "12:00:00",
      }),
    ).toBe("upcoming");
    expect(
      getShiftHeroStatus({
        entry: makeEntry({ startTime: null, endTime: null }),
        startTime: null,
        endTime: null,
        currentDate: "2026-04-17",
        currentTime: "12:00:00",
      }),
    ).toBe("completed");
  });

  it("has no status without an entry", () => {
    expect(
      getShiftHeroStatus({
        entry: null,
        startTime: "07:00:00",
        endTime: "15:00:00",
        currentDate: "2026-04-16",
        currentTime: "12:00:00",
      }),
    ).toBe("scheduled");
  });
});

describe("getShiftHeroStatusLabel", () => {
  it("uses the Home hero's wording", () => {
    expect(getShiftHeroStatusLabel("active")).toBe("On Duty");
    expect(getShiftHeroStatusLabel("upcoming")).toBe("Upcoming");
    expect(getShiftHeroStatusLabel("away")).toBe("Away");
    expect(getShiftHeroStatusLabel("scheduled")).toBe("Scheduled");
    expect(getShiftHeroStatusLabel("completed")).toBe("Completed");
  });
});

describe("toHeroTimingStatus", () => {
  it("maps completed onto the status that stops the countdown", () => {
    expect(toHeroTimingStatus("completed")).toBe("empty");
    expect(toHeroTimingStatus("active")).toBe("active");
  });
});

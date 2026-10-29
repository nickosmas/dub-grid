import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShiftRequestAvailability } from "./shiftRequestAvailability";

const TIME_ZONE = "America/Los_Angeles";

const DAY_SHIFT: MobileScheduleEntry["state"] = {
  kind: "worked",
  segments: [{ shiftId: 1, jobId: 1, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
};

const DAY_SHIFT_PRESENTATION: MobileScheduleEntry["presentation"] = {
  label: "D",
  shiftName: "Day Shift",
  focusAreaId: 2,
  focusAreaName: "ICU",
  displayFocusAreaName: "ICU",
  startTime: "07:00:00",
  endTime: "15:00:00",
  segments: [
    {
      shiftId: 1,
      jobId: 1,
      shiftName: "Day Shift",
      shiftStartTime: "07:00:00",
      shiftEndTime: "15:00:00",
      startTime: "07:00:00",
      endTime: "15:00:00",
      focusAreaId: 2,
      displayFocusAreaName: "ICU",
    },
  ],
};

function buildEntry(overrides: Partial<MobileScheduleEntry> = {}): MobileScheduleEntry {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Kim",
    employeeFocusAreaIds: [2],
    date: "2026-04-16",
    state: DAY_SHIFT,
    presentation: DAY_SHIFT_PRESENTATION,
    change: null,
    publishedAt: "2026-04-15T18:30:00.000Z",
    publishedByName: "Mina Diaz",
    indicators: [],
    ...overrides,
  };
}

function availability(
  entry: MobileScheduleEntry | null,
  overrides: Partial<Parameters<typeof getShiftRequestAvailability>[0]> = {},
) {
  return getShiftRequestAvailability({
    entry,
    linkedEmployeeId: "emp-1",
    timeZone: TIME_ZONE,
    isCheckingExistingRequests: false,
    hasExistingRequestCheckError: false,
    hasActiveRequest: false,
    ...overrides,
  });
}

describe("getShiftRequestAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 12:00 PM on Apr 15 in Los Angeles.
    vi.setSystemTime(new Date("2026-04-15T19:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers drop and swap on an upcoming scheduled shift with nothing to say", () => {
    expect(availability(buildEntry())).toEqual({
      canDrop: true,
      canSwap: true,
      notice: null,
      canRetry: false,
    });
  });

  it("says nothing on a teammate's shift", () => {
    expect(availability(buildEntry({ employeeId: "emp-2" }))).toMatchObject({
      canDrop: false,
      notice: null,
    });
    expect(availability(buildEntry(), { linkedEmployeeId: null }).notice).toBeNull();
  });

  it("explains a shift that has started", () => {
    expect(availability(buildEntry({ date: "2026-04-15" }))).toMatchObject({
      canDrop: false,
      canSwap: false,
      notice: "This shift has started, so it can't be dropped or swapped.",
    });
  });

  it("explains a shift that is over", () => {
    expect(availability(buildEntry({ date: "2026-04-14" })).notice).toBe(
      "This shift is over, so it can't be dropped or swapped.",
    );
  });

  it("explains a removed shift before its time", () => {
    const entry = buildEntry({
      date: "2026-04-14",
      change: { kind: "deleted" } as MobileScheduleEntry["change"],
    });

    expect(availability(entry).notice).toBe(
      "This shift was removed, so it can't be dropped or swapped.",
    );
  });

  it("explains an absence without naming it", () => {
    const result = availability(
      buildEntry({
        state: { ...DAY_SHIFT, kind: "absence", segments: [], absenceTypeId: 3 },
        presentation: { ...DAY_SHIFT_PRESENTATION, label: "Sick", shiftName: "Sick", segments: [] },
      }),
    );

    expect(result.canDrop).toBe(false);
    expect(result.notice).toBe("You're off this day, so there's no shift to drop or swap.");
  });

  it("stays quiet while the request check runs or a request is under way", () => {
    expect(availability(buildEntry(), { isCheckingExistingRequests: true })).toMatchObject({
      canDrop: false,
      notice: null,
    });
    expect(availability(buildEntry(), { hasActiveRequest: true })).toMatchObject({
      canDrop: false,
      notice: null,
    });
  });

  it("offers a retry when the request check failed", () => {
    expect(availability(buildEntry(), { hasExistingRequestCheckError: true })).toEqual({
      canDrop: false,
      canSwap: false,
      notice:
        "We couldn't check for an existing request on this shift, so drop and swap are off for now.",
      canRetry: true,
    });
  });

  it("offers only a drop on a general shift and says why", () => {
    const entry = buildEntry({
      state: { ...DAY_SHIFT, segments: [{ shiftId: null, jobId: 1, position: 0 }] },
      presentation: {
        ...DAY_SHIFT_PRESENTATION,
        shiftName: "Training",
        segments: [{ ...DAY_SHIFT_PRESENTATION.segments[0], shiftId: null, shiftName: "Training" }],
      },
    });

    expect(availability(entry)).toEqual({
      canDrop: true,
      canSwap: false,
      notice: "A general shift can be dropped but not swapped.",
      canRetry: false,
    });
  });
});

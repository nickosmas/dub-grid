import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getShiftRequestAvailability,
  SHIFT_REQUEST_CHECK_FAILED_NOTICE,
} from "./shiftRequestAvailability";

const TIME_ZONE = "America/Los_Angeles";

type Segment = MobileScheduleEntry["presentation"]["segments"][number];

function segment(
  shiftId: number | null,
  shiftName: string,
  startTime: string,
  endTime: string,
): Segment {
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

function worked(segments: Segment[]): Pick<MobileScheduleEntry, "state" | "presentation"> {
  return {
    state: {
      kind: "worked",
      segments: segments.map((item, position) => ({
        shiftId: item.shiftId ?? null,
        jobId: 1,
        position,
      })),
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    presentation: {
      label: "D",
      shiftName: segments[0]?.shiftName ?? null,
      focusAreaId: 2,
      focusAreaName: "ICU",
      displayFocusAreaName: "ICU",
      startTime: segments[0]?.startTime ?? null,
      endTime: segments.at(-1)?.endTime ?? null,
      segments,
    },
  };
}

const DAY_SHIFT = segment(1, "Day Shift", "07:00:00", "15:00:00");

function buildEntry(overrides: Partial<MobileScheduleEntry> = {}): MobileScheduleEntry {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Kim",
    employeeFocusAreaIds: [2],
    date: "2026-04-16",
    ...worked([DAY_SHIFT]),
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
  const NONE = { canDrop: false, canSwap: false, notice: null, canRetry: false };

  beforeEach(() => {
    vi.useFakeTimers();
    // 12:00 PM on Apr 15 in Los Angeles.
    vi.setSystemTime(new Date("2026-04-15T19:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers drop and swap on an upcoming shift with nothing to say", () => {
    expect(availability(buildEntry())).toEqual({
      canDrop: true,
      canSwap: true,
      notice: null,
      canRetry: false,
    });
  });

  it("says nothing on a teammate's shift or without a linked person", () => {
    expect(availability(buildEntry({ employeeId: "emp-2" }))).toEqual(NONE);
    expect(availability(buildEntry(), { linkedEmployeeId: null })).toEqual(NONE);
    expect(availability(null)).toEqual(NONE);
  });

  it("hides the actions without explaining on a shift that has started or is over", () => {
    const morning = buildEntry({
      date: "2026-04-15",
      ...worked([segment(1, "Early", "05:00:00", "09:00:00")]),
    });

    expect(availability(buildEntry({ date: "2026-04-15" }))).toEqual(NONE);
    expect(availability(morning)).toEqual(NONE);
    expect(availability(buildEntry({ date: "2026-04-14" }))).toEqual(NONE);
  });

  it("keeps the actions while a later shift in the cell has not started", () => {
    const double = buildEntry({
      date: "2026-04-15",
      ...worked([
        segment(1, "Day Shift", "07:00:00", "11:00:00"),
        segment(2, "Evening Shift", "15:00:00", "23:00:00"),
      ]),
    });

    expect(availability(double)).toMatchObject({ canDrop: true, canSwap: true, notice: null });
  });

  it("hides the actions without explaining on a removed shift", () => {
    const removedChange = {
      kind: "deleted",
      previousPresentation: worked([DAY_SHIFT]).presentation,
    } as MobileScheduleEntry["change"];

    expect(availability(buildEntry({ change: removedChange }))).toEqual(NONE);
    expect(
      availability(
        buildEntry({
          date: "2026-04-14",
          state: { ...buildEntry().state, kind: "deleted", segments: [] },
        }),
      ),
    ).toEqual(NONE);
  });

  it("hides the actions without explaining on a whole-day absence", () => {
    const result = availability(
      buildEntry({
        state: { ...buildEntry().state, kind: "absence", segments: [], absenceTypeId: 3 },
        presentation: { ...buildEntry().presentation, shiftName: "Sick", segments: [] },
      }),
    );

    expect(result).toEqual(NONE);
  });

  it("keeps drop and swap on a shift with an absence beside it", () => {
    const base = buildEntry();
    const withAbsence = buildEntry({
      state: {
        ...base.state,
        absenceTypeId: 3,
        absenceStartTime: "11:00",
        absenceEndTime: "15:00",
      },
    });

    expect(availability(withAbsence)).toEqual({
      canDrop: true,
      canSwap: true,
      notice: null,
      canRetry: false,
    });
  });

  it("stays quiet while the request check runs or a request is under way", () => {
    expect(availability(buildEntry(), { isCheckingExistingRequests: true })).toEqual(NONE);
    expect(availability(buildEntry(), { hasActiveRequest: true })).toEqual(NONE);
  });

  it("offers a retry when the request check failed", () => {
    expect(availability(buildEntry(), { hasExistingRequestCheckError: true })).toEqual({
      canDrop: false,
      canSwap: false,
      notice: SHIFT_REQUEST_CHECK_FAILED_NOTICE,
      canRetry: true,
    });
  });

  it("offers no retry on a shift that has started, even when the check failed", () => {
    expect(
      availability(buildEntry({ date: "2026-04-15" }), { hasExistingRequestCheckError: true }),
    ).toEqual(NONE);
  });

  it("offers only a drop on a general shift, without explaining the missing swap", () => {
    const entry = buildEntry(worked([segment(null, "Training", "07:00:00", "15:00:00")]));

    expect(availability(entry)).toEqual({
      canDrop: true,
      canSwap: false,
      notice: null,
      canRetry: false,
    });
  });
});

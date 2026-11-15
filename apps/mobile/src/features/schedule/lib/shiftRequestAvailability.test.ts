import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShiftRequestAvailability, SHIFT_REQUEST_NOTICES } from "./shiftRequestAvailability";

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
    expect(availability(buildEntry({ employeeId: "emp-2" }))).toMatchObject({
      canDrop: false,
      notice: null,
    });
    expect(availability(buildEntry(), { linkedEmployeeId: null }).notice).toBeNull();
    expect(availability(null).notice).toBeNull();
  });

  it("explains a shift that has started", () => {
    expect(availability(buildEntry({ date: "2026-04-15" }))).toEqual({
      canDrop: false,
      canSwap: false,
      notice: SHIFT_REQUEST_NOTICES.started,
      canRetry: false,
    });
  });

  it("explains a shift that is over, earlier today or on a past day", () => {
    const morning = buildEntry({
      date: "2026-04-15",
      ...worked([segment(1, "Early", "05:00:00", "09:00:00")]),
    });

    expect(availability(morning).notice).toBe(SHIFT_REQUEST_NOTICES.over);
    expect(availability(buildEntry({ date: "2026-04-14" })).notice).toBe(
      SHIFT_REQUEST_NOTICES.over,
    );
  });

  it("treats last night's shift that runs into today as started, not over", () => {
    vi.setSystemTime(new Date("2026-04-15T13:00:00.000Z")); // 6:00 AM in Los Angeles
    const overnight = buildEntry({
      date: "2026-04-14",
      ...worked([segment(3, "Night Shift", "23:00:00", "07:00:00")]),
    });

    expect(availability(overnight).notice).toBe(SHIFT_REQUEST_NOTICES.started);
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

  it("explains a removed shift, past or upcoming", () => {
    const removedChange = {
      kind: "deleted",
      previousPresentation: worked([DAY_SHIFT]).presentation,
    } as MobileScheduleEntry["change"];

    expect(availability(buildEntry({ change: removedChange })).notice).toBe(
      SHIFT_REQUEST_NOTICES.removed,
    );
    expect(
      availability(
        buildEntry({
          date: "2026-04-14",
          state: { ...buildEntry().state, kind: "deleted", segments: [] },
        }),
      ).notice,
    ).toBe(SHIFT_REQUEST_NOTICES.removed);
  });

  it("explains a whole-day absence without naming it", () => {
    const result = availability(
      buildEntry({
        state: { ...buildEntry().state, kind: "absence", segments: [], absenceTypeId: 3 },
        presentation: { ...buildEntry().presentation, shiftName: "Sick", segments: [] },
      }),
    );

    expect(result).toMatchObject({ canDrop: false, canSwap: false });
    expect(result.notice).toBe(SHIFT_REQUEST_NOTICES.absence);
    expect(result.notice).not.toContain("Sick");
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
      notice: SHIFT_REQUEST_NOTICES.checkFailed,
      canRetry: true,
    });
  });

  it("says a shift that has started first, even when the check failed", () => {
    expect(
      availability(buildEntry({ date: "2026-04-15" }), { hasExistingRequestCheckError: true }),
    ).toMatchObject({ notice: SHIFT_REQUEST_NOTICES.started, canRetry: false });
  });

  it("offers only a drop on a general shift and says why", () => {
    const entry = buildEntry(worked([segment(null, "Training", "07:00:00", "15:00:00")]));

    expect(availability(entry)).toEqual({
      canDrop: true,
      canSwap: false,
      notice: SHIFT_REQUEST_NOTICES.generalShift,
      canRetry: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { hasShiftStartedAtTimeRanges } from "./index";

describe("hasShiftStartedAtTimeRanges", () => {
  // 2026-05-14, 14:30 UTC
  const now = new Date("2026-05-14T14:30:00Z");
  const timeZone = "UTC";

  it("returns false when the shift date has no value", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: null,
        timeRanges: [{ start: "07:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  it("treats a past-dated shift as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-13",
        timeRanges: [{ start: "23:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a future-dated shift as not started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-15",
        timeRanges: [{ start: "01:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  it("treats a same-day shift past its start time as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "07:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a same-day shift before its start time as not started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "15:00" }],
        now,
        timeZone,
      }),
    ).toBe(false);
  });

  // Regression: a single-digit hour ("7:00") must not be string-compared
  // against the zero-padded current time ("14:30") — "14:30" < "7:00"
  // lexically, which previously left already-started shifts visible.
  it("handles unpadded single-digit hour start times", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "7:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "9:30" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  // Regression: the earliest start must be picked numerically, not by
  // lexical string sort (which would rank "15:00" before "7:00").
  it("uses the numerically earliest range start", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [{ start: "15:00" }, { start: "7:00" }],
        now,
        timeZone,
      }),
    ).toBe(true);
  });

  it("treats a same-day shift with no resolvable times as started", () => {
    expect(
      hasShiftStartedAtTimeRanges({
        shiftDate: "2026-05-14",
        timeRanges: [],
        now,
        timeZone,
      }),
    ).toBe(true);
  });
});

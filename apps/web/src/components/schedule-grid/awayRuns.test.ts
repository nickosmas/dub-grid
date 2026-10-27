import { describe, expect, it } from "vitest";
import { awayReturnDate, buildRowAwayDays, isOnScheduleGrid } from "./awayRuns";

const period = { lastDateKey: "2026-11-07", todayKey: "2026-11-02" };
const week = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
];

describe("awayReturnDate", () => {
  it("is the return date of someone away, and null for anyone else", () => {
    expect(awayReturnDate({ status: "inactive", awayUntil: "2026-11-05" })).toBe("2026-11-05");
    expect(awayReturnDate({ status: "inactive", awayUntil: null })).toBeNull();
    expect(awayReturnDate({ status: "active", awayUntil: "2026-11-05" })).toBeNull();
    expect(
      awayReturnDate({ status: "inactive", awayUntil: "2026-11-05", archivedAt: "2026-10-01" }),
    ).toBeNull();
  });
});

describe("isOnScheduleGrid", () => {
  it("keeps everyone active and anyone away with a return date", () => {
    expect(isOnScheduleGrid({ status: "active" }, period)).toBe(true);
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2027-01-04" }, period)).toBe(true);
    // Back within the period, or before it while still marked away.
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2026-11-04" }, period)).toBe(true);
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2026-10-01" }, period)).toBe(true);
  });

  it("leaves off someone away with no return date, and archived people", () => {
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: null }, period)).toBe(false);
    expect(isOnScheduleGrid({ status: "removed" }, period)).toBe(false);
  });

  it("keeps a past period's rows as they were", () => {
    expect(
      isOnScheduleGrid(
        { status: "inactive", awayUntil: "2027-01-04" },
        { lastDateKey: "2026-10-31", todayKey: "2026-11-02" },
      ),
    ).toBe(false);
  });
});

describe("buildRowAwayDays", () => {
  it("is null without a return date or with no day before it", () => {
    expect(buildRowAwayDays(null, week, period.todayKey)).toBeNull();
    expect(buildRowAwayDays("2026-11-01", week, period.todayKey)).toBeNull();
  });

  it("locks every day before the return date and runs the ones from today", () => {
    const away = buildRowAwayDays("2026-11-05", week, period.todayKey);
    expect(away?.locked).toEqual([true, true, true, true, false, false, false]);
    expect(away?.runs).toEqual([
      null,
      { runIndex: 0, start: 1, length: 3, position: "start" },
      { runIndex: 0, start: 1, length: 3, position: "middle" },
      { runIndex: 0, start: 1, length: 3, position: "end" },
      null,
      null,
      null,
    ]);
  });

  it("draws a single away day as its own run", () => {
    const away = buildRowAwayDays("2026-11-03", week, period.todayKey);
    expect(away?.runs[1]).toEqual({ runIndex: 0, start: 1, length: 1, position: "start" });
    expect(away?.runs.filter(Boolean)).toHaveLength(1);
  });

  it("splits the run at the week boundary", () => {
    const twoWeeks = [
      ...week,
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ];
    const away = buildRowAwayDays("2026-11-10", twoWeeks, "2026-11-01", 7);
    expect(away?.runs[0]).toMatchObject({ runIndex: 0, start: 0, length: 7 });
    expect(away?.runs[7]).toMatchObject({ runIndex: 1, start: 7, length: 2, position: "start" });
    expect(away?.runs[8]).toMatchObject({ runIndex: 1, position: "end" });
    expect(away?.runs[9]).toBeNull();
  });
});

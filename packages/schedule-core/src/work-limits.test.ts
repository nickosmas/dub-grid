import { describe, expect, it } from "vitest";
import { daysInARowWith, daysInWeekWith, workLimitBreaks } from "./work-limits";

const workedOn = (...dateKeys: string[]) => {
  const days = new Set(dateKeys);
  return (dateKey: string) => days.has(dateKey);
};

// 2026-11-22 is a Sunday; a two-week period might end Saturday 2026-11-28.
const lastFiveOfPeriod = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];

describe("daysInARowWith and daysInWeekWith", () => {
  it("count the day itself as worked", () => {
    expect(daysInARowWith(workedOn(...lastFiveOfPeriod), "2026-11-29")).toBe(6);
    expect(daysInWeekWith(workedOn(), "2026-11-29")).toBe(1);
  });

  it("keep the Sunday-to-Saturday week across a month end", () => {
    const worked = workedOn("2026-11-29", "2026-11-30", "2026-12-01");
    expect(daysInWeekWith(worked, "2026-12-05")).toBe(4);
  });
});

describe("workLimitBreaks", () => {
  it("names nothing for a day not worked", () => {
    expect(
      workLimitBreaks({ worked: workedOn(...lastFiveOfPeriod), dateKey: "2026-11-29" }),
    ).toEqual([]);
  });

  it("names nothing for exactly five days in a row", () => {
    expect(
      workLimitBreaks({ worked: workedOn(...lastFiveOfPeriod), dateKey: "2026-11-28" }),
    ).toEqual([]);
  });

  it("counts a run across the period's start and the week's end", () => {
    const worked = workedOn(...lastFiveOfPeriod, "2026-11-29");
    expect(workLimitBreaks({ worked, dateKey: "2026-11-29" })).toEqual([
      { limit: "row", days: 6, start: "2026-11-24", end: "2026-11-29" },
    ]);
  });

  it("names the whole run from any day in it, a seventh day included", () => {
    const worked = workedOn(...lastFiveOfPeriod, "2026-11-29", "2026-11-30");
    expect(workLimitBreaks({ worked, dateKey: "2026-11-25" })).toEqual([
      { limit: "row", days: 7, start: "2026-11-24", end: "2026-11-30" },
    ]);
  });

  it("names a sixth day in a week, even with a day off between", () => {
    const worked = workedOn(
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
    );
    expect(workLimitBreaks({ worked, dateKey: "2026-11-28" })).toEqual([
      { limit: "week", days: 6, start: "2026-11-22", end: "2026-11-28" },
    ]);
  });

  it("names a week over 40 hours, and not one at 40", () => {
    const worked = workedOn("2026-11-23");
    expect(workLimitBreaks({ worked, weekHours: 40, dateKey: "2026-11-23" })).toEqual([]);
    expect(workLimitBreaks({ worked, weekHours: 40.5, dateKey: "2026-11-23" })).toEqual([
      { limit: "hours", hours: 40.5, start: "2026-11-22", end: "2026-11-28" },
    ]);
  });

  it("names every limit a day crosses, in row, week, hours order", () => {
    const worked = workedOn(
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    );
    expect(
      workLimitBreaks({ worked, weekHours: 48, dateKey: "2026-11-27" }).map((b) => b.limit),
    ).toEqual(["row", "week", "hours"]);
  });

  it("stops looking for the run's edge when every day is worked", () => {
    const [row] = workLimitBreaks({ worked: () => true, dateKey: "2026-11-25" });
    expect(row).toMatchObject({ limit: "row", days: 125 });
  });
});

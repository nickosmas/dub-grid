import { describe, expect, it } from "vitest";
import {
  formatActivityPeriodLabel,
  formatActivityPeriodPhrase,
  formatActivityTodayLabel,
  getActivityPeriod,
  isCurrentActivityPeriod,
  isValidDateKey,
  parseActivityPeriodParams,
  shiftActivityPeriod,
} from "./activity-period";

const TODAY = "2026-09-06";

describe("getActivityPeriod", () => {
  it("bounds a day, a Sunday-start week, and a calendar month", () => {
    expect(getActivityPeriod("day", "2026-09-09")).toEqual({
      unit: "day",
      startDate: "2026-09-09",
      endDate: "2026-09-09",
    });
    expect(getActivityPeriod("week", "2026-09-09")).toEqual({
      unit: "week",
      startDate: "2026-09-06",
      endDate: "2026-09-12",
    });
    expect(getActivityPeriod("month", "2026-09-09")).toEqual({
      unit: "month",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("keeps a Sunday anchor on its own week", () => {
    expect(getActivityPeriod("week", "2026-09-06").startDate).toBe("2026-09-06");
  });

  it("ends February on the right day in common and leap years", () => {
    expect(getActivityPeriod("month", "2026-02-10").endDate).toBe("2026-02-28");
    expect(getActivityPeriod("month", "2028-02-10").endDate).toBe("2028-02-29");
  });
});

describe("shiftActivityPeriod", () => {
  it("steps a day, a week, and a month", () => {
    expect(shiftActivityPeriod(getActivityPeriod("day", TODAY), -1).startDate).toBe("2026-09-05");
    expect(shiftActivityPeriod(getActivityPeriod("week", TODAY), 1).startDate).toBe("2026-09-13");
    expect(shiftActivityPeriod(getActivityPeriod("month", TODAY), -1)).toEqual({
      unit: "month",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
  });

  it("crosses a year boundary", () => {
    expect(shiftActivityPeriod(getActivityPeriod("month", "2026-01-15"), -1).startDate).toBe(
      "2025-12-01",
    );
    expect(shiftActivityPeriod(getActivityPeriod("month", "2026-12-15"), 1).startDate).toBe(
      "2027-01-01",
    );
  });

  it("steps from January into February without overshooting", () => {
    const january = getActivityPeriod("month", "2026-01-31");
    expect(shiftActivityPeriod(january, 1)).toEqual({
      unit: "month",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
  });
});

describe("formatActivityPeriodLabel", () => {
  it("names a day, a week, and a month", () => {
    expect(formatActivityPeriodLabel(getActivityPeriod("day", TODAY))).toBe("Sun, Sep 6, 2026");
    expect(formatActivityPeriodLabel(getActivityPeriod("month", TODAY))).toBe("September 2026");
  });

  it("names the month once when a week stays inside it", () => {
    expect(formatActivityPeriodLabel(getActivityPeriod("week", "2026-09-09"))).toBe(
      "Sep 6 - 12, 2026",
    );
  });

  it("names both months when a week spans two, and both years when it spans two", () => {
    expect(formatActivityPeriodLabel(getActivityPeriod("week", "2026-09-01"))).toBe(
      "Aug 30 - Sep 5, 2026",
    );
    expect(formatActivityPeriodLabel(getActivityPeriod("week", "2026-12-31"))).toBe(
      "Dec 27, 2026 - Jan 2, 2027",
    );
  });

  it("uses a hyphen rather than a dash", () => {
    expect(formatActivityPeriodLabel(getActivityPeriod("week", TODAY))).not.toMatch(/[–—]/);
  });
});

describe("formatActivityPeriodPhrase", () => {
  it("says today, this week, and this month for the current period", () => {
    expect(formatActivityPeriodPhrase(getActivityPeriod("day", TODAY), TODAY)).toBe("today");
    expect(formatActivityPeriodPhrase(getActivityPeriod("week", TODAY), TODAY)).toBe("this week");
    expect(formatActivityPeriodPhrase(getActivityPeriod("month", TODAY), TODAY)).toBe("this month");
  });

  it("names a past period instead", () => {
    expect(formatActivityPeriodPhrase(getActivityPeriod("day", "2026-09-05"), TODAY)).toBe(
      "yesterday",
    );
    expect(formatActivityPeriodPhrase(getActivityPeriod("day", "2026-09-02"), TODAY)).toBe(
      "on Sep 2, 2026",
    );
    expect(formatActivityPeriodPhrase(getActivityPeriod("week", "2026-08-25"), TODAY)).toBe(
      "the week of Aug 23",
    );
    expect(formatActivityPeriodPhrase(getActivityPeriod("month", "2026-08-25"), TODAY)).toBe(
      "in August 2026",
    );
  });
});

describe("isCurrentActivityPeriod and formatActivityTodayLabel", () => {
  it("recognizes the period containing today", () => {
    expect(isCurrentActivityPeriod(getActivityPeriod("week", TODAY), TODAY)).toBe(true);
    expect(isCurrentActivityPeriod(getActivityPeriod("week", "2026-08-25"), TODAY)).toBe(false);
  });

  it("labels the Today button after the unit it returns to", () => {
    expect(formatActivityTodayLabel("day")).toBe("Today");
    expect(formatActivityTodayLabel("week")).toBe("This week");
    expect(formatActivityTodayLabel("month")).toBe("This month");
  });
});

describe("parseActivityPeriodParams", () => {
  it("accepts a valid unit and date", () => {
    expect(parseActivityPeriodParams({ period: "day", date: "2026-08-24" }, TODAY)).toEqual({
      unit: "day",
      anchorDate: "2026-08-24",
    });
  });

  it("falls back to the current week for anything malformed", () => {
    const fallback = { unit: "week", anchorDate: TODAY };
    expect(parseActivityPeriodParams({}, TODAY)).toEqual(fallback);
    expect(parseActivityPeriodParams({ period: "year", date: null }, TODAY)).toEqual(fallback);
    expect(parseActivityPeriodParams({ period: "week", date: "2026-13-40" }, TODAY)).toEqual(
      fallback,
    );
    expect(parseActivityPeriodParams({ period: "week", date: "tomorrow" }, TODAY)).toEqual(
      fallback,
    );
    expect(parseActivityPeriodParams({ period: "week", date: "2026-02-30" }, TODAY)).toEqual(
      fallback,
    );
  });

  it("keeps a valid date when only the unit is unusable", () => {
    expect(parseActivityPeriodParams({ period: "decade", date: "2026-08-24" }, TODAY)).toEqual({
      unit: "week",
      anchorDate: "2026-08-24",
    });
  });
});

describe("isValidDateKey", () => {
  it("rejects impossible calendar days", () => {
    expect(isValidDateKey("2026-09-06")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("26-09-06")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatPersonPeriodLabel,
  formatPersonPeriodPhrase,
  isCurrentMonth,
  localIsoToday,
  monthPeriod,
  stepPersonPeriod,
} from "./person-period";

const TODAY = "2026-10-29";

describe("monthPeriod", () => {
  it("covers the whole calendar month holding the date", () => {
    expect(monthPeriod(TODAY)).toEqual({
      kind: "month",
      range: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });
    expect(monthPeriod("2028-02-10").range.endDate).toBe("2028-02-29");
  });
});

describe("stepPersonPeriod", () => {
  it("steps a month back and forward across a year", () => {
    const january = monthPeriod("2027-01-15");
    expect(stepPersonPeriod(january, -1).range).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
    expect(stepPersonPeriod(january, 1).range).toEqual({
      startDate: "2027-02-01",
      endDate: "2027-02-28",
    });
  });

  it("steps out of picked dates to the month they start or end in", () => {
    const custom = {
      kind: "custom" as const,
      range: { startDate: "2026-08-02", endDate: "2026-10-24" },
    };
    expect(stepPersonPeriod(custom, -1)).toEqual(monthPeriod("2026-08-01"));
    expect(stepPersonPeriod(custom, 1)).toEqual(monthPeriod("2026-10-01"));
  });
});

describe("isCurrentMonth", () => {
  it("is true only for today's month", () => {
    expect(isCurrentMonth(monthPeriod(TODAY), TODAY)).toBe(true);
    expect(isCurrentMonth(monthPeriod("2026-09-03"), TODAY)).toBe(false);
    expect(isCurrentMonth({ kind: "custom", range: monthPeriod(TODAY).range }, TODAY)).toBe(false);
  });
});

describe("formatPersonPeriodLabel", () => {
  it("names a month, or the picked dates", () => {
    expect(formatPersonPeriodLabel(monthPeriod(TODAY))).toBe("October 2026");
    expect(
      formatPersonPeriodLabel({
        kind: "custom",
        range: { startDate: "2026-08-02", endDate: "2026-10-24" },
      }),
    ).toBe("Aug 2 - Oct 24");
  });
});

describe("formatPersonPeriodPhrase", () => {
  it("words the period for summaries", () => {
    expect(formatPersonPeriodPhrase(monthPeriod(TODAY), TODAY)).toBe("this month");
    expect(formatPersonPeriodPhrase(monthPeriod("2026-09-01"), TODAY)).toBe("in September");
    expect(formatPersonPeriodPhrase(monthPeriod("2025-12-01"), TODAY)).toBe("in December 2025");
    expect(
      formatPersonPeriodPhrase(
        { kind: "custom", range: { startDate: "2026-09-01", endDate: "2026-10-15" } },
        TODAY,
      ),
    ).toBe("between Sep 1 and Oct 15");
  });
});

describe("localIsoToday", () => {
  it("reads the viewer's calendar day", () => {
    expect(localIsoToday(new Date(2026, 9, 29, 23, 30))).toBe("2026-10-29");
  });
});

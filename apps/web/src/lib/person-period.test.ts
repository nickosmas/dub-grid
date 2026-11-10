import { describe, expect, it } from "vitest";
import {
  formatPersonPeriodLabel,
  formatPersonPeriodPhrase,
  isCurrentPeriod,
  localIsoToday,
  monthPeriod,
  personPeriod,
  personPeriodSpans,
  stepPersonPeriod,
} from "./person-period";

const TODAY = "2026-10-29";
// A Sunday; pay periods run two weeks from it.
const PAY_ANCHOR = "2026-01-04";

describe("personPeriod", () => {
  it("covers the Sunday-to-Saturday week holding the date", () => {
    expect(personPeriod("week", TODAY).range).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-10-31",
    });
    expect(personPeriod("week", "2026-10-25").range.startDate).toBe("2026-10-25");
  });

  it("covers the pay period holding the date, before or after the anchor", () => {
    expect(personPeriod("pay-period", TODAY, PAY_ANCHOR).range).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-11-07",
    });
    expect(personPeriod("pay-period", "2026-11-07", PAY_ANCHOR).range.startDate).toBe("2026-10-25");
    expect(personPeriod("pay-period", "2025-12-31", PAY_ANCHOR).range).toEqual({
      startDate: "2025-12-21",
      endDate: "2026-01-03",
    });
  });

  it("covers the calendar year holding the date", () => {
    expect(personPeriod("year", TODAY).range).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });
});

describe("personPeriodSpans", () => {
  it("offers Pay period only once the organization has set one", () => {
    expect(personPeriodSpans(PAY_ANCHOR)).toEqual(["week", "pay-period", "month", "year"]);
    expect(personPeriodSpans(null)).toEqual(["week", "month", "year"]);
    expect(personPeriodSpans("not a date")).toEqual(["week", "month", "year"]);
  });
});

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
    expect(stepPersonPeriod(custom, 1, { span: "week" })).toEqual(
      personPeriod("week", "2026-10-24"),
    );
  });

  it("steps a week, a pay period or a year", () => {
    expect(stepPersonPeriod(personPeriod("week", TODAY), 1).range).toEqual({
      startDate: "2026-11-01",
      endDate: "2026-11-07",
    });
    const payPeriod = personPeriod("pay-period", TODAY, PAY_ANCHOR);
    expect(stepPersonPeriod(payPeriod, -1, { payPeriodStartDate: PAY_ANCHOR }).range).toEqual({
      startDate: "2026-10-11",
      endDate: "2026-10-24",
    });
    expect(stepPersonPeriod(personPeriod("year", TODAY), -1).range).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
  });
});

describe("isCurrentPeriod", () => {
  it("is true only for the span holding today", () => {
    expect(isCurrentPeriod(monthPeriod(TODAY), TODAY)).toBe(true);
    expect(isCurrentPeriod(monthPeriod("2026-09-03"), TODAY)).toBe(false);
    expect(isCurrentPeriod(personPeriod("week", "2026-10-25"), TODAY)).toBe(true);
    expect(isCurrentPeriod(personPeriod("week", "2026-10-24"), TODAY)).toBe(false);
    expect(
      isCurrentPeriod(personPeriod("pay-period", "2026-11-05", PAY_ANCHOR), TODAY, PAY_ANCHOR),
    ).toBe(true);
    expect(isCurrentPeriod({ kind: "custom", range: monthPeriod(TODAY).range }, TODAY)).toBe(false);
  });
});

describe("formatPersonPeriodLabel", () => {
  it("names a month, or the picked dates", () => {
    expect(formatPersonPeriodLabel(monthPeriod(TODAY))).toBe("October 2026");
    expect(formatPersonPeriodLabel(personPeriod("year", TODAY))).toBe("2026");
    expect(formatPersonPeriodLabel(personPeriod("week", TODAY))).toBe("Oct 25 - Oct 31");
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
    expect(formatPersonPeriodPhrase(personPeriod("week", TODAY), TODAY)).toBe("this week");
    expect(
      formatPersonPeriodPhrase(personPeriod("pay-period", TODAY, PAY_ANCHOR), TODAY, PAY_ANCHOR),
    ).toBe("this pay period");
    expect(formatPersonPeriodPhrase(personPeriod("week", "2026-10-01"), TODAY)).toBe(
      "between Sep 27 and Oct 3",
    );
    expect(formatPersonPeriodPhrase(personPeriod("year", TODAY), TODAY)).toBe("this year");
    expect(formatPersonPeriodPhrase(personPeriod("year", "2025-03-01"), TODAY)).toBe("in 2025");
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

import { describe, expect, it } from "vitest";
import {
  formatPersonPeriodPhrase,
  parseStoredPeriod,
  resolvePersonPeriod,
  serializeStoredPeriod,
} from "./person-period";

const THU_OCT_29 = new Date(2026, 9, 29, 12);
const CURRENT_WEEK = { startDate: "2026-10-25", endDate: "2026-10-31" };

describe("parseStoredPeriod", () => {
  it("keeps a preset and a valid custom range", () => {
    expect(parseStoredPeriod('{"preset":"this-month"}')).toEqual({ preset: "this-month" });
    expect(
      parseStoredPeriod(
        '{"preset":"custom","range":{"startDate":"2026-09-01","endDate":"2026-10-15"}}',
      ),
    ).toEqual({ preset: "custom", range: { startDate: "2026-09-01", endDate: "2026-10-15" } });
  });

  it("reads anything missing, malformed or unknown as Current week", () => {
    for (const raw of [null, "", "not json", "42", "null", '{"preset":"next-year"}', "[]"]) {
      expect(parseStoredPeriod(raw)).toEqual({ preset: "current-week" });
    }
  });

  it("refuses a custom range that is too long, backwards or missing", () => {
    for (const range of [
      { startDate: "2025-01-01", endDate: "2026-10-15" },
      { startDate: "2026-10-15", endDate: "2026-09-01" },
      undefined,
      { startDate: 5, endDate: "2026-09-01" },
    ]) {
      expect(parseStoredPeriod(JSON.stringify({ preset: "custom", range }))).toEqual({
        preset: "current-week",
      });
    }
  });

  it("drops dates stored beside a preset that has its own", () => {
    expect(
      parseStoredPeriod(
        '{"preset":"pay-period","range":{"startDate":"2026-09-01","endDate":"2026-10-15"}}',
      ),
    ).toEqual({ preset: "pay-period" });
  });

  it("reads back what it writes", () => {
    const stored = {
      preset: "custom" as const,
      range: { startDate: "2026-09-01", endDate: "2026-10-15" },
    };
    expect(parseStoredPeriod(serializeStoredPeriod(stored))).toEqual(stored);
    expect(serializeStoredPeriod({ preset: "this-month", range: stored.range })).toBe(
      '{"preset":"this-month"}',
    );
  });
});

describe("resolvePersonPeriod", () => {
  it("gives today's dates for a preset", () => {
    expect(resolvePersonPeriod({ preset: "pay-period" }, "2026-10-04", THU_OCT_29)).toEqual({
      preset: "pay-period",
      range: { startDate: "2026-10-18", endDate: "2026-10-31" },
    });
  });

  it("covers the current week for an unset pay period and says so", () => {
    expect(resolvePersonPeriod({ preset: "pay-period" }, null, THU_OCT_29)).toEqual({
      preset: "pay-period",
      range: CURRENT_WEEK,
      payPeriodUnset: true,
    });
  });

  it("keeps a custom range and falls back to the current week without one", () => {
    const range = { startDate: "2026-09-01", endDate: "2026-10-15" };
    expect(resolvePersonPeriod({ preset: "custom", range }, null, THU_OCT_29)).toEqual({
      preset: "custom",
      range,
    });
    expect(resolvePersonPeriod({ preset: "custom" }, null, THU_OCT_29)).toEqual({
      preset: "current-week",
      range: CURRENT_WEEK,
    });
  });
});

describe("formatPersonPeriodPhrase", () => {
  it("reads as part of a sentence for every preset", () => {
    const range = { startDate: "2026-09-01", endDate: "2026-10-15" };
    expect(formatPersonPeriodPhrase({ preset: "current-week", range })).toBe("this week");
    expect(formatPersonPeriodPhrase({ preset: "pay-period", range })).toBe("this pay period");
    expect(formatPersonPeriodPhrase({ preset: "this-month", range })).toBe("this month");
    expect(formatPersonPeriodPhrase({ preset: "last-12-weeks", range })).toBe(
      "in the last 12 weeks",
    );
    expect(formatPersonPeriodPhrase({ preset: "custom", range })).toBe("between Sep 1 and Oct 15");
  });

  it("names the week it falls back to when the pay period isn't set", () => {
    expect(
      formatPersonPeriodPhrase({ preset: "pay-period", range: CURRENT_WEEK, payPeriodUnset: true }),
    ).toBe("this week");
  });
});

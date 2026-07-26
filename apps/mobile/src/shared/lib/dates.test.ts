import { describe, expect, it } from "vitest";
import {
  formatDashboardDateRange,
  formatUsDate,
  formatUsTime,
  getDashboardPeriodRange,
} from "./dates";

describe("formatUsDate", () => {
  it("formats an ISO date key as a short US date", () => {
    expect(formatUsDate("2026-05-12")).toBe("May 12");
  });

  it("falls back to the raw string for an invalid date", () => {
    expect(formatUsDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatUsTime", () => {
  it("formats a morning 24h time as 12h AM", () => {
    expect(formatUsTime("07:00:00")).toBe("7:00 AM");
  });

  it("formats an afternoon 24h time as 12h PM", () => {
    expect(formatUsTime("15:30:00")).toBe("3:30 PM");
  });

  it("formats midnight as 12 AM", () => {
    expect(formatUsTime("00:00")).toBe("12:00 AM");
  });

  it("formats noon as 12 PM", () => {
    expect(formatUsTime("12:00")).toBe("12:00 PM");
  });
});

describe("getDashboardPeriodRange", () => {
  const wednesday = new Date(2026, 4, 13); // Wed May 13, 2026

  it("returns the Sunday-start current week for 'week' mode", () => {
    expect(getDashboardPeriodRange("week", wednesday)).toEqual({
      startDate: "2026-05-10",
      endDate: "2026-05-16",
    });
  });

  it("returns a 14-day Sunday-start range for '2weeks' mode", () => {
    expect(getDashboardPeriodRange("2weeks", wednesday)).toEqual({
      startDate: "2026-05-10",
      endDate: "2026-05-23",
    });
  });

  it("returns just today for 'day' mode", () => {
    expect(getDashboardPeriodRange("day", wednesday)).toEqual({
      startDate: "2026-05-13",
      endDate: "2026-05-13",
    });
  });

  it("anchors '2weeks' to the org's pay-period start when configured", () => {
    // Anchor 2026-05-03 (Sunday) + 14 days lands the containing period at
    // 2026-05-03..05-16, which does NOT match the plain Sunday-start window
    // (2026-05-10..05-23) — proves the anchor, not the fallback, was used.
    expect(getDashboardPeriodRange("2weeks", wednesday, "2026-05-03")).toEqual({
      startDate: "2026-05-03",
      endDate: "2026-05-16",
    });
  });

  it("ignores the pay-period anchor for 'week' mode", () => {
    expect(getDashboardPeriodRange("week", wednesday, "2026-05-03")).toEqual({
      startDate: "2026-05-10",
      endDate: "2026-05-16",
    });
  });

  it("falls back to Sunday-start '2weeks' when no anchor is configured", () => {
    expect(getDashboardPeriodRange("2weeks", wednesday, null)).toEqual({
      startDate: "2026-05-10",
      endDate: "2026-05-23",
    });
  });
});

describe("formatDashboardDateRange", () => {
  it("formats a single day with the weekday name", () => {
    expect(formatDashboardDateRange("2026-07-10", "2026-07-10", "day")).toBe("Fri, Jul 10, 2026");
  });

  it("formats a week within the same month as a compact dash range", () => {
    expect(formatDashboardDateRange("2026-07-05", "2026-07-11", "week")).toBe("Jul 5–11, 2026");
  });

  it("formats a range spanning two months in the same year", () => {
    expect(formatDashboardDateRange("2026-07-26", "2026-08-01", "week")).toBe(
      "Jul 26 – Aug 1, 2026",
    );
  });

  it("formats a range spanning a year boundary", () => {
    expect(formatDashboardDateRange("2026-12-21", "2027-01-03", "2weeks")).toBe(
      "Dec 21, 2026 – Jan 3, 2027",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPeriodOptions,
  countRangeDays,
  formatCompactRangeLabel,
  isValidCustomRange,
  resolvePayPeriodRange,
  resolvePeriodPreset,
} from "./period-presets";

// Local noon, so the viewer's calendar day is the same in every timezone the suite runs in.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const THU_OCT_29 = at(2026, 10, 29);

describe("resolvePeriodPreset", () => {
  it("covers Sunday to Saturday for the current week", () => {
    expect(resolvePeriodPreset("current-week", null, THU_OCT_29)).toEqual({
      startDate: "2026-10-25",
      endDate: "2026-10-31",
    });
  });

  it("starts the current week on the day itself when today is Sunday", () => {
    expect(resolvePeriodPreset("current-week", null, at(2026, 10, 25))?.startDate).toBe(
      "2026-10-25",
    );
  });

  it("covers the whole calendar month, ending on its last day", () => {
    expect(resolvePeriodPreset("this-month", null, THU_OCT_29)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    expect(resolvePeriodPreset("this-month", null, at(2028, 2, 29))).toEqual({
      startDate: "2028-02-01",
      endDate: "2028-02-29",
    });
  });

  it("covers the 12 whole weeks before the current one", () => {
    const range = resolvePeriodPreset("last-12-weeks", null, THU_OCT_29);
    expect(range).toEqual({ startDate: "2026-08-02", endDate: "2026-10-24" });
    expect(countRangeDays(range!)).toBe(84);
  });

  it("leaves Custom to the caller", () => {
    expect(resolvePeriodPreset("custom", "2026-01-04", THU_OCT_29)).toBeNull();
  });
});

describe("resolvePayPeriodRange", () => {
  it("finds the 14-day period holding today", () => {
    expect(resolvePayPeriodRange("2026-10-04", THU_OCT_29)).toEqual({
      startDate: "2026-10-18",
      endDate: "2026-10-31",
    });
  });

  it("moves to the next period on its first day and stays put on its last", () => {
    expect(resolvePayPeriodRange("2026-10-04", at(2026, 11, 1))?.startDate).toBe("2026-11-01");
    expect(resolvePayPeriodRange("2026-10-04", at(2026, 10, 31))?.startDate).toBe("2026-10-18");
  });

  it("counts back from an anchor in the future", () => {
    expect(resolvePayPeriodRange("2026-11-15", THU_OCT_29)).toEqual({
      startDate: "2026-10-18",
      endDate: "2026-10-31",
    });
  });

  it("is null with no anchor or a malformed one", () => {
    expect(resolvePayPeriodRange(null, THU_OCT_29)).toBeNull();
    expect(resolvePayPeriodRange("", THU_OCT_29)).toBeNull();
    expect(resolvePayPeriodRange("2026-02-30", THU_OCT_29)).toBeNull();
  });
});

describe("custom ranges", () => {
  it("allows up to 366 days and refuses longer, backwards or malformed ranges", () => {
    expect(isValidCustomRange({ startDate: "2026-01-01", endDate: "2027-01-01" })).toBe(true);
    expect(isValidCustomRange({ startDate: "2026-01-01", endDate: "2027-01-02" })).toBe(false);
    expect(isValidCustomRange({ startDate: "2026-10-29", endDate: "2026-10-28" })).toBe(false);
    expect(isValidCustomRange({ startDate: "soon", endDate: "2026-10-28" })).toBe(false);
  });
});

describe("labels", () => {
  it("names the year only when the range crosses one", () => {
    expect(formatCompactRangeLabel({ startDate: "2026-10-18", endDate: "2026-10-31" })).toBe(
      "Oct 18 - Oct 31",
    );
    expect(formatCompactRangeLabel({ startDate: "2026-12-27", endDate: "2027-01-09" })).toBe(
      "Dec 27, 2026 - Jan 9, 2027",
    );
  });

  it("gives each preset its dates, and says when the pay period isn't set", () => {
    const options = buildPeriodOptions(
      ["current-week", "pay-period", "custom"] as const,
      { startDate: "2026-09-01", endDate: "2026-10-15" },
      null,
      false,
      THU_OCT_29,
    );
    expect(options.map((option) => option.label)).toEqual([
      "Current week (Oct 25 - Oct 31)",
      "Pay period (not set)",
      "Custom",
    ]);
  });

  it("names a chosen custom range", () => {
    const [custom] = buildPeriodOptions(
      ["custom"] as const,
      { startDate: "2026-09-01", endDate: "2026-10-15" },
      null,
      true,
      THU_OCT_29,
    );
    expect(custom.label).toBe("Custom (Sep 1 - Oct 15)");
  });
});

import { describe, expect, it } from "vitest";
import {
  getContainingPayPeriodStartIso,
  getDashboardPeriodStartIso,
  getIsoWeekStart,
} from "./pay-period";

describe("getContainingPayPeriodStartIso", () => {
  it("returns null when no anchor is configured", () => {
    expect(getContainingPayPeriodStartIso("2026-07-11", null)).toBeNull();
    expect(getContainingPayPeriodStartIso("2026-07-11", undefined)).toBeNull();
  });

  it("returns the anchor itself when the target date is the anchor", () => {
    expect(getContainingPayPeriodStartIso("2026-07-05", "2026-07-05")).toBe("2026-07-05");
  });

  it("returns the anchor for any date within the first 14-day period", () => {
    expect(getContainingPayPeriodStartIso("2026-07-11", "2026-07-05")).toBe("2026-07-05");
    expect(getContainingPayPeriodStartIso("2026-07-18", "2026-07-05")).toBe("2026-07-05");
  });

  it("rolls forward to the next 14-day boundary", () => {
    expect(getContainingPayPeriodStartIso("2026-07-19", "2026-07-05")).toBe("2026-07-19");
    expect(getContainingPayPeriodStartIso("2026-07-25", "2026-07-05")).toBe("2026-07-19");
  });

  it("handles dates before the anchor (negative offset)", () => {
    expect(getContainingPayPeriodStartIso("2026-06-25", "2026-07-05")).toBe("2026-06-21");
  });
});

describe("getIsoWeekStart", () => {
  it("returns the preceding Sunday", () => {
    // 2026-07-11 is a Saturday.
    expect(getIsoWeekStart("2026-07-11")).toBe("2026-07-05");
  });

  it("returns itself when already a Sunday", () => {
    expect(getIsoWeekStart("2026-07-05")).toBe("2026-07-05");
  });
});

describe("getDashboardPeriodStartIso", () => {
  it("uses the pay-period anchor for a 2-week span when configured", () => {
    expect(getDashboardPeriodStartIso("2026-07-11", 2, "2026-07-05")).toBe("2026-07-05");
  });

  it("falls back to Sunday-start for a 2-week span with no anchor", () => {
    expect(getDashboardPeriodStartIso("2026-07-11", 2, null)).toBe("2026-07-05");
  });

  it("always uses Sunday-start for a 1-week span, ignoring any anchor", () => {
    expect(getDashboardPeriodStartIso("2026-07-11", 1, "2026-07-06")).toBe("2026-07-05");
  });
});

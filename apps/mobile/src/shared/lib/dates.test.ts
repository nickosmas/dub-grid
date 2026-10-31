import { describe, expect, it } from "vitest";
import { formatUsDate, formatUsTime } from "./dates";

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

import { describe, expect, it } from "vitest";
import type { MobileScheduleEntry } from "@dubgrid/contracts";
import { formatCalendarMonthTitle, getCalendarDotRanges, getScheduledDates } from "./schedule";

describe("formatCalendarMonthTitle", () => {
  it("leaves the year off in the current year", () => {
    expect(formatCalendarMonthTitle("2026-11-01", "2026-11-02")).toBe("November");
  });

  it("spells the year out in any other year", () => {
    expect(formatCalendarMonthTitle("2027-01-01", "2026-11-02")).toBe("January 2027");
    expect(formatCalendarMonthTitle("2025-12-01", "2026-01-05")).toBe("December 2025");
  });
});

describe("getScheduledDates", () => {
  const entry = (date: string, state: Partial<MobileScheduleEntry["state"]>) =>
    ({ date, state: { kind: "worked", segments: [], ...state } }) as unknown as MobileScheduleEntry;

  it("marks days with a worked shift and not an absence alone", () => {
    const dates = getScheduledDates([
      entry("2026-11-02", { segments: [{} as never] }),
      entry("2026-11-03", { kind: "absence" }),
      entry("2026-11-04", { kind: "worked", segments: [] }),
    ]);
    expect([...dates]).toEqual(["2026-11-02"]);
  });
});

describe("getCalendarDotRanges", () => {
  it("covers the span with fixed four-week blocks under the 31-day limit", () => {
    const ranges = getCalendarDotRanges("2026-10-25", "2026-12-12");
    expect(ranges[0].startDate <= "2026-10-25").toBe(true);
    expect(ranges[ranges.length - 1].endDate >= "2026-12-12").toBe(true);
    for (const range of ranges) {
      const days = (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000 + 1;
      expect(days).toBe(28);
      expect(new Date(`${range.startDate}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });

  it("returns the same block for any span inside it", () => {
    expect(getCalendarDotRanges("2026-11-02", "2026-11-03")).toEqual(
      getCalendarDotRanges("2026-11-03", "2026-11-04"),
    );
  });
});

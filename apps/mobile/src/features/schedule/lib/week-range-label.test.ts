import { describe, expect, it } from "vitest";
import {
  compactSameMonthRange,
  formatSplitDayTitle,
  formatWeekdayDayTitle,
  getWeekHeading,
} from "./week-range-label";

describe("compactSameMonthRange", () => {
  it("names a month once when the week stays inside it", () => {
    expect(compactSameMonthRange("Nov 15 - Nov 21")).toBe("Nov 15 - 21");
  });

  it("keeps both months when the week crosses one", () => {
    expect(compactSameMonthRange("Nov 29 - Dec 5")).toBe("Nov 29 - Dec 5");
  });
});

describe("getWeekHeading", () => {
  const week = (startDate: string, endDate: string) => ({ startDate, endDate });

  it("names the weeks around today with their dates under the name", () => {
    expect(getWeekHeading(week("2026-11-15", "2026-11-21"), "2026-11-21")).toEqual({
      title: "This week",
      dates: "Nov 15 - 21",
      isThisWeek: true,
    });
    expect(getWeekHeading(week("2026-11-22", "2026-11-28"), "2026-11-21").title).toBe("Next week");
    expect(getWeekHeading(week("2026-11-08", "2026-11-14"), "2026-11-21").title).toBe("Last week");
  });

  it("names any other week by its dates alone, once", () => {
    expect(getWeekHeading(week("2026-11-29", "2026-12-05"), "2026-11-21")).toEqual({
      title: "Nov 29 - Dec 5",
      dates: null,
      isThisWeek: false,
    });
  });
});

describe("formatSplitDayTitle", () => {
  it("calls today Today", () => {
    expect(formatSplitDayTitle("2026-11-22", "2026-11-22")).toBe("Today");
  });

  it("names any other day by its weekday and date", () => {
    expect(formatSplitDayTitle("2026-11-25", "2026-11-22")).toBe("Wednesday 25");
  });
});

describe("formatWeekdayDayTitle", () => {
  it("names the weekday and the day, leaving the month to the calendar beside it", () => {
    expect(formatWeekdayDayTitle("2026-11-22")).toBe("Sunday, 22");
    expect(formatWeekdayDayTitle("2026-10-05")).toBe("Monday, 5");
  });
});

import { describe, expect, it } from "vitest";
import { compactSameMonthRange, getWeekHeading } from "./week-range-label";

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

import { describe, expect, it } from "vitest";
import {
  buildSeriesCalendar,
  describeSeriesPattern,
  formatSeriesSpan,
  seriesDayDiffers,
  seriesDayPosition,
  seriesScopeOptions,
  type SeriesSnapshotLike,
  type SeriesStateLike,
} from "./series-summary";

const MON_WED = ["2026-10-26", "2026-10-28", "2026-11-02", "2026-11-04"];

describe("describeSeriesPattern", () => {
  it("names the days in week order", () => {
    expect(
      describeSeriesPattern({ frequency: "weekly", daysOfWeek: [3, 1], startDate: "2026-10-26" }),
    ).toBe("Every week on Mon and Wed");
  });

  it("lists three or more days with a final and", () => {
    expect(
      describeSeriesPattern({
        frequency: "biweekly",
        daysOfWeek: [1, 2, 4],
        startDate: "2026-10-05",
      }),
    ).toBe("Every 2 weeks on Mon, Tue and Thu");
  });

  it("falls back to the start date's weekday", () => {
    expect(
      describeSeriesPattern({ frequency: "weekly", daysOfWeek: null, startDate: "2026-10-28" }),
    ).toBe("Every week on Wed");
  });

  it("reads a daily series plainly", () => {
    expect(
      describeSeriesPattern({ frequency: "daily", daysOfWeek: null, startDate: "2026-10-28" }),
    ).toBe("Every day");
  });
});

describe("formatSeriesSpan", () => {
  it("spans the first to the last day held", () => {
    expect(formatSeriesSpan(MON_WED)).toBe("Oct 26 to Nov 4, 2026 · 4 days");
  });

  it("names both years across a new year", () => {
    expect(formatSeriesSpan(["2026-12-28", "2027-01-04"])).toBe(
      "Dec 28, 2026 to Jan 4, 2027 · 2 days",
    );
  });

  it("reads a single day", () => {
    expect(formatSeriesSpan(["2026-10-26"])).toBe("Oct 26, 2026 · 1 day");
  });
});

describe("seriesDayPosition", () => {
  it("counts from 1", () => {
    expect(seriesDayPosition(MON_WED, "2026-10-28")).toEqual({ index: 2, total: 4 });
  });

  it("is null for a day outside the series", () => {
    expect(seriesDayPosition(MON_WED, "2026-10-27")).toBeNull();
  });
});

describe("buildSeriesCalendar", () => {
  it("lays out whole Sunday-to-Saturday weeks", () => {
    const calendar = buildSeriesCalendar(MON_WED, "2026-10-28", ["2026-11-04"]);
    expect(calendar.clipped).toBe(false);
    expect(calendar.weeks).toHaveLength(2);
    expect(calendar.weeks[0][0].date).toBe("2026-10-25");
    expect(calendar.weeks[1][6].date).toBe("2026-11-07");
    const thisDay = calendar.weeks[0][3];
    expect(thisDay).toMatchObject({ date: "2026-10-28", isThisDay: true, inSeries: true });
    expect(calendar.weeks[1][3]).toMatchObject({ date: "2026-11-04", changedOnItsOwn: true });
    expect(calendar.weeks[1][0]).toMatchObject({ date: "2026-11-01", monthLabel: "Nov" });
  });

  it("shows six weeks around the day when the series runs longer", () => {
    const weekly = Array.from({ length: 20 }, (_, week) => {
      const date = new Date(Date.UTC(2026, 0, 5 + week * 7));
      return date.toISOString().slice(0, 10);
    });
    const calendar = buildSeriesCalendar(weekly, weekly[10]);
    expect(calendar.clipped).toBe(true);
    expect(calendar.weeks).toHaveLength(6);
    expect(calendar.weeks.flat().some((day) => day.isThisDay)).toBe(true);
    expect(calendar.weeks[2].some((day) => day.isThisDay)).toBe(true);
  });

  it("does not mark a changed date outside the series", () => {
    const calendar = buildSeriesCalendar(MON_WED, "2026-10-28", ["2026-10-27"]);
    expect(calendar.weeks.flat().some((day) => day.changedOnItsOwn)).toBe(false);
  });
});

describe("seriesDayDiffers", () => {
  const state: SeriesStateLike = {
    kind: "worked",
    absenceTypeId: null,
    segments: [{ shiftId: 1, jobId: 7, position: 0, isMentored: false }],
  };
  const same: SeriesSnapshotLike = {
    state_kind: "worked",
    absence_type_id: null,
    custom_start_time: null,
    custom_end_time: null,
    segments: [{ position: 0, shift_id: 1, job_id: 7, is_mentored: false }],
  };

  it("matches a day holding the series' shift", () => {
    expect(seriesDayDiffers(state, same)).toBe(false);
  });

  it("matches ids that arrive as strings", () => {
    expect(
      seriesDayDiffers(
        { ...state, segments: [{ shiftId: "1" as unknown as number, jobId: 7 }] },
        same,
      ),
    ).toBe(false);
  });

  it("flags another shift, custom times, mentoring, an absence and a removal", () => {
    expect(
      seriesDayDiffers(state, { ...same, segments: [{ ...same.segments![0], shift_id: 2 }] }),
    ).toBe(true);
    expect(seriesDayDiffers(state, { ...same, custom_end_time: "13:00:00" })).toBe(true);
    expect(
      seriesDayDiffers(state, { ...same, segments: [{ ...same.segments![0], is_mentored: true }] }),
    ).toBe(true);
    expect(seriesDayDiffers(state, { ...same, absence_type_id: 3 })).toBe(true);
    expect(seriesDayDiffers(state, { ...same, state_kind: "deleted", segments: [] })).toBe(true);
  });
});

describe("seriesScopeOptions", () => {
  it("counts the days each choice reaches", () => {
    const options = seriesScopeOptions(MON_WED, "2026-10-28");
    expect(options.map((option) => [option.scope, option.count, option.detail])).toEqual([
      ["this", 1, "Wed, Oct 28"],
      ["following", 3, "Oct 28 to Nov 4, 2026 · 3 days"],
      ["previous", 2, "Oct 26 to Oct 28, 2026 · 2 days"],
      ["all", 4, "Oct 26 to Nov 4, 2026 · 4 days"],
    ]);
  });

  it("leaves the counts unknown without the series' days", () => {
    const options = seriesScopeOptions(null, "2026-10-28");
    expect(options[0].count).toBe(1);
    expect(options.slice(1).every((option) => option.count == null && option.detail == null)).toBe(
      true,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  awayLockedHint,
  awayRangeOf,
  awayReturnDate,
  awayRunLabel,
  buildRowAwayDays,
  gridAwayRange,
  isAwayOn,
  isInAwayRange,
  isOnScheduleGrid,
  LEAVING_RUN_LABEL,
  startsRunLabel,
  type AwayRange,
} from "./awayRuns";

const period = { lastDateKey: "2026-11-07", todayKey: "2026-11-02" };
const week = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
];

describe("awayReturnDate", () => {
  it("is the return date of someone away, and null for anyone else", () => {
    expect(awayReturnDate({ status: "inactive", awayUntil: "2026-11-05" })).toBe("2026-11-05");
    expect(awayReturnDate({ status: "inactive", awayUntil: null })).toBeNull();
    expect(awayReturnDate({ status: "active", awayUntil: "2026-11-05" })).toBeNull();
    expect(
      awayReturnDate({ status: "inactive", awayUntil: "2026-11-05", archivedAt: "2026-10-01" }),
    ).toBeNull();
  });
});

describe("isOnScheduleGrid", () => {
  it("keeps everyone active and anyone away with a return date", () => {
    expect(isOnScheduleGrid({ status: "active" }, period)).toBe(true);
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2027-01-04" }, period)).toBe(true);
    // Back within the period, or before it while still marked away.
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2026-11-04" }, period)).toBe(true);
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: "2026-10-01" }, period)).toBe(true);
  });

  it("leaves off someone away with no return date, and archived people", () => {
    expect(isOnScheduleGrid({ status: "inactive", awayUntil: null }, period)).toBe(false);
    expect(isOnScheduleGrid({ status: "removed" }, period)).toBe(false);
  });

  it("keeps a past period's rows as they were", () => {
    expect(
      isOnScheduleGrid(
        { status: "inactive", awayUntil: "2027-01-04" },
        { lastDateKey: "2026-10-31", todayKey: "2026-11-02" },
      ),
    ).toBe(false);
  });
});

describe("buildRowAwayDays", () => {
  it("is null without a return date or with no day before it", () => {
    expect(buildRowAwayDays(null, week, period.todayKey)).toBeNull();
    expect(buildRowAwayDays({ from: null, until: "2026-11-01" }, week, period.todayKey)).toBeNull();
  });

  it("locks every day before the return date and runs the ones from today", () => {
    const away = buildRowAwayDays({ from: null, until: "2026-11-05" }, week, period.todayKey);
    expect(away?.locked).toEqual([true, true, true, true, false, false, false]);
    expect(away?.runs).toEqual([
      null,
      { runIndex: 0, start: 1, length: 3, position: "start" },
      { runIndex: 0, start: 1, length: 3, position: "middle" },
      { runIndex: 0, start: 1, length: 3, position: "end" },
      null,
      null,
      null,
    ]);
  });

  it("draws a single away day as its own run", () => {
    const away = buildRowAwayDays({ from: null, until: "2026-11-03" }, week, period.todayKey);
    expect(away?.runs[1]).toEqual({ runIndex: 0, start: 1, length: 1, position: "start" });
    expect(away?.runs.filter(Boolean)).toHaveLength(1);
  });

  it("splits the run at the week boundary", () => {
    const twoWeeks = [
      ...week,
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ];
    const away = buildRowAwayDays({ from: null, until: "2026-11-10" }, twoWeeks, "2026-11-01", 7);
    expect(away?.runs[0]).toMatchObject({ runIndex: 0, start: 0, length: 7 });
    expect(away?.runs[7]).toMatchObject({ runIndex: 1, start: 7, length: 2, position: "start" });
    expect(away?.runs[8]).toMatchObject({ runIndex: 1, position: "end" });
    expect(away?.runs[9]).toBeNull();
  });
});

describe("awayRunLabel", () => {
  it("names the absence the away days hold, or just Away", () => {
    expect(awayRunLabel("Vacation")).toBe("Away · Vacation");
    expect(awayRunLabel(null)).toBe("Away");
  });
});

describe("awayLockedHint", () => {
  it("names the return date and where to change it", () => {
    expect(awayLockedHint({ from: null, until: "2026-11-06" })).toBe(
      "Away until Fri, Nov 6. Change the return date on their record to change these days.",
    );
  });
});

describe("planned away in the grid (51g1)", () => {
  it("takes the range from a planned Away, and only for someone Active", () => {
    const plan = { plannedStatus: "away" as const, plannedFrom: "2026-11-04", plannedUntil: null };
    expect(awayRangeOf({ status: "active", ...plan })).toEqual({ from: "2026-11-04", until: null });
    expect(awayRangeOf({ status: "inactive", awayUntil: "2026-11-05", ...plan })).toEqual({
      from: null,
      until: "2026-11-05",
    });
    expect(awayRangeOf({ status: "active" })).toBeNull();
  });

  it("locks and draws only the days from the start up to the return date", () => {
    const away = buildRowAwayDays({ from: "2026-11-03", until: "2026-11-05" }, week, "2026-11-01");
    expect(away?.locked).toEqual([false, false, true, true, false, false, false]);
    expect(away?.runs.filter(Boolean)).toHaveLength(2);
  });

  it("says where to change a planned Away", () => {
    expect(awayLockedHint({ from: "2026-11-03", until: "2026-11-05" })).toBe(
      "Away from Tue, Nov 3 until Thu, Nov 5. Change the planned time away on their record to change these days.",
    );
  });
});

describe("last day in the grid (51g2)", () => {
  // Last day Wed, Nov 4: offboarded from Thu, Nov 5.
  const leaving = {
    status: "active" as const,
    plannedStatus: "removed" as const,
    plannedFrom: "2026-11-05",
    plannedUntil: null,
  };

  it("locks and draws the days after the last day, labeled Offboarded", () => {
    const range = awayRangeOf(leaving);
    expect(range).toEqual({ from: "2026-11-05", until: null, lastDay: "2026-11-04" });
    const days = buildRowAwayDays(range, week, "2026-11-01");
    expect(days?.locked).toEqual([false, false, false, false, true, true, true]);
    expect(LEAVING_RUN_LABEL).toBe("Offboarded");
  });

  it("names the last day and where to change it", () => {
    expect(
      awayLockedHint(awayRangeOf(leaving) as NonNullable<ReturnType<typeof awayRangeOf>>),
    ).toBe("Last day Wed, Nov 4. Change the last day on their record to change these days.");
  });

  it("leaves someone already offboarded off it", () => {
    expect(awayRangeOf({ ...leaving, archivedAt: "2026-11-05T08:00:00Z" })).toBeNull();
  });
});

describe("first day in the grid (51g4)", () => {
  it("locks the days before the first day, alone or beside a planned change", () => {
    const alone = awayRangeOf({ status: "active", firstDay: "2026-11-04" });
    expect(alone).toEqual({ from: "2026-11-04", until: "2026-11-04", firstDay: "2026-11-04" });
    expect(isInAwayRange(alone!, "2026-11-03")).toBe(true);
    expect(isInAwayRange(alone!, "2026-11-04")).toBe(false);
    expect(isInAwayRange(alone!, "2026-12-01")).toBe(false);

    const withLastDay = awayRangeOf({
      status: "active",
      firstDay: "2026-11-04",
      plannedStatus: "removed",
      plannedFrom: "2026-12-01",
    });
    expect(isInAwayRange(withLastDay!, "2026-11-03")).toBe(true);
    expect(isInAwayRange(withLastDay!, "2026-11-20")).toBe(false);
    expect(isInAwayRange(withLastDay!, "2026-12-01")).toBe(true);
  });

  it("leaves someone offboarded or with no first day alone", () => {
    expect(awayRangeOf({ status: "active", firstDay: null })).toBeNull();
    expect(
      awayRangeOf({
        status: "removed",
        archivedAt: "2026-10-01T00:00:00Z",
        firstDay: "2026-11-04",
      }),
    ).toBeNull();
  });

  it("draws the days before it from today and names the day", () => {
    const range = awayRangeOf({ status: "active", firstDay: "2026-11-04" })!;
    const days = buildRowAwayDays(range, week, "2026-11-02");
    expect(days?.locked).toEqual([true, true, true, false, false, false, false]);
    expect(days?.runs.filter(Boolean).length).toBeGreaterThan(0);
    expect(days?.runs[0]).toBeNull();
    expect(startsRunLabel("2026-11-04")).toBe("Starts Nov 4");
    expect(awayLockedHint(range, "2026-11-03")).toBe(
      "Starts Wed, Nov 4. Change their first day on their record to change these days.",
    );
    expect(awayLockedHint(range)).toBe(
      "Starts Wed, Nov 4. Change their first day on their record to change these days.",
    );
  });

  it("names a planned change's own days after the first day", () => {
    const range = awayRangeOf({
      status: "active",
      firstDay: "2026-11-04",
      plannedStatus: "removed",
      plannedFrom: "2026-11-07",
    })!;
    expect(awayLockedHint(range, "2026-11-07")).toBe(
      "Last day Fri, Nov 6. Change the last day on their record to change these days.",
    );
  });
});

describe("the day someone went away", () => {
  // Away since Tue, Oct 27 until Mon, Nov 9; today is Mon, Nov 2.
  const range = { from: null, until: "2026-11-09", since: "2026-10-27" };
  const twoWeeks = [
    "2026-10-25",
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    ...week,
  ];

  it("dates the range from when they were marked away", () => {
    expect(
      awayRangeOf({
        status: "inactive",
        awayUntil: "2026-11-09",
        statusChangedAt: "2026-10-27T15:00:00Z",
      }),
    ).toEqual(range);
  });

  it("draws one bar per week from that day, through today", () => {
    const away = buildRowAwayDays(range, twoWeeks, period.todayKey, 7);
    expect(away?.locked.every(Boolean)).toBe(true);
    expect(away?.runs.slice(0, 2)).toEqual([null, null]);
    expect(away?.runs[2]).toMatchObject({ runIndex: 0, start: 2, length: 5, position: "start" });
    expect(away?.runs[7]).toMatchObject({ runIndex: 1, start: 7, length: 7, position: "start" });
    expect(away?.runs[8]).toMatchObject({ runIndex: 1, position: "middle" });
  });

  it("draws a past week on its own", () => {
    const away = buildRowAwayDays(range, twoWeeks.slice(0, 7), "2026-11-02");
    expect(away?.runs[2]).toMatchObject({ runIndex: 0, start: 2, length: 5 });
  });

  it("draws from today when the day isn't known", () => {
    const away = buildRowAwayDays({ from: null, until: "2026-11-09" }, twoWeeks, "2026-11-02", 7);
    expect(away?.runs.slice(0, 8).every((day) => day === null)).toBe(true);
    expect(away?.runs[8]).toMatchObject({ start: 8, length: 6 });
  });

  it("counts them away only from that day, though earlier days stay locked", () => {
    expect(isInAwayRange(range, "2026-10-26")).toBe(true);
    expect(isAwayOn(range, "2026-10-26")).toBe(false);
    expect(isAwayOn(range, "2026-10-27")).toBe(true);
    expect(isAwayOn({ from: null, until: "2026-11-09" }, "2026-10-26")).toBe(true);
  });

  it("says why a day before it is locked", () => {
    expect(awayLockedHint(range, "2026-10-26")).toBe(
      "Away since Tue, Oct 27. Days before they went away can't be changed while they're away.",
    );
    expect(awayLockedHint(range, "2026-11-03")).toBe(
      "Away until Mon, Nov 9. Change the return date on their record to change these days.",
    );
  });

  it("puts them on the grid for a past period that reaches that day", () => {
    const away = { status: "inactive" as const, awayUntil: "2026-11-09" };
    const lastWeek = { lastDateKey: "2026-10-31", todayKey: "2026-11-02" };
    expect(isOnScheduleGrid(away, lastWeek, "2026-10-27")).toBe(true);
    expect(isOnScheduleGrid(away, { ...lastWeek, lastDateKey: "2026-10-24" }, "2026-10-27")).toBe(
      false,
    );
    expect(isOnScheduleGrid(away, lastWeek)).toBe(false);
  });
});

describe("gridAwayRange", () => {
  const base = { id: "emp-1", status: "active" as const, awayUntil: null, archivedAt: null };
  const noRanges = new Map<string, AwayRange>();

  it("gives an editor every range", () => {
    const leaving = { ...base, plannedStatus: "removed" as const, plannedFrom: "2026-11-06" };
    expect(gridAwayRange(leaving, noRanges, true)).toEqual(awayRangeOf(leaving));
  });

  it("gives anyone else only someone Away now, without their first day", () => {
    const away = {
      ...base,
      status: "inactive" as const,
      awayUntil: "2026-11-05",
      firstDay: "2026-10-01",
    };
    expect(gridAwayRange(away, noRanges, false)).toEqual({ from: null, until: "2026-11-05" });

    const dated = new Map([[away.id, { from: null, until: "2026-11-05", since: "2026-10-20" }]]);
    expect(gridAwayRange(away, dated, false)).toEqual({
      from: null,
      until: "2026-11-05",
      since: "2026-10-20",
    });
  });

  it("hides a planned away, a last day and a first day from anyone else", () => {
    for (const person of [
      { ...base, plannedStatus: "away" as const, plannedFrom: "2026-11-04", plannedUntil: null },
      { ...base, plannedStatus: "removed" as const, plannedFrom: "2026-11-06" },
      { ...base, firstDay: "2026-11-04" },
    ]) {
      expect(gridAwayRange(person, noRanges, true)).not.toBeNull();
      expect(gridAwayRange(person, noRanges, false)).toBeNull();
    }
  });
});

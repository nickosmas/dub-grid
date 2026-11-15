import { describe, expect, it } from "vitest";
import {
  describeOtherPeriodPublishes,
  describeOwnChangedDays,
  formatDayLabel,
  groupPublishesByPeriod,
  ownChangedDays,
} from "@/lib/publish-notice";
import type { PublishChange, PublishHistoryEntry, ScheduleCellState } from "@/types";

const worked = (shiftId: number): ScheduleCellState => ({
  kind: "worked",
  segments: [{ shiftId, jobId: 1, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

const change = (overrides: Partial<PublishChange> = {}): PublishChange => ({
  empId: "me",
  date: "2026-11-03",
  kind: "modified",
  ...overrides,
});

const entry = (
  overrides: Partial<PublishHistoryEntry> & Pick<PublishHistoryEntry, "changes">,
): PublishHistoryEntry => ({
  id: "p",
  publishedBy: null,
  startDate: "2026-11-01",
  endDate: "2026-11-07",
  changeCount: overrides.changes.length,
  publishedAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

describe("formatDayLabel", () => {
  it("names the weekday and date", () => {
    expect(formatDayLabel("2026-11-03")).toBe("Tue, Nov 3");
  });
});

describe("ownChangedDays", () => {
  it("lists each of the viewer's changed days once, in order", () => {
    const entries = [
      entry({
        changes: [
          change({ date: "2026-11-05" }),
          change({ date: "2026-11-03" }),
          change({ empId: "someone-else", date: "2026-11-04" }),
        ],
      }),
      entry({
        publishedAt: "2026-11-02T10:00:00.000Z",
        changes: [change({ date: "2026-11-05", kind: "deleted" })],
      }),
    ];
    expect(ownChangedDays(entries, "me")).toEqual(["2026-11-03", "2026-11-05"]);
  });

  it("skips a period's first publication and keeps a later addition", () => {
    const entries = [
      entry({
        changes: [
          change({ kind: "new", isNewAddition: false, date: "2026-11-02" }),
          change({ kind: "new", isNewAddition: true, date: "2026-11-04" }),
        ],
      }),
    ];
    expect(ownChangedDays(entries, "me")).toEqual(["2026-11-04"]);
  });

  it("leaves out a shift changed and changed back", () => {
    const entries = [
      entry({
        publishedAt: "2026-11-02T10:00:00.000Z",
        changes: [change({ fromState: worked(2), toState: worked(1) })],
      }),
      entry({ changes: [change({ fromState: worked(1), toState: worked(2) })] }),
    ];
    expect(ownChangedDays(entries, "me")).toEqual([]);
  });

  it("reads changes whose details the organization hides", () => {
    const entries = [entry({ changes: [change({ detailsHidden: true, fromState: null })] })];
    expect(ownChangedDays(entries, "me")).toEqual(["2026-11-03"]);
  });

  it("returns nothing without a staff record", () => {
    expect(ownChangedDays([entry({ changes: [change()] })], null)).toEqual([]);
  });
});

describe("describeOwnChangedDays", () => {
  it("names one day", () => {
    expect(describeOwnChangedDays(["2026-11-03"])).toBe("Your shifts changed on Tue, Nov 3");
  });

  it("joins two days with and", () => {
    expect(describeOwnChangedDays(["2026-11-03", "2026-11-05"])).toBe(
      "Your shifts changed on Tue, Nov 3 and Thu, Nov 5",
    );
  });

  it("counts the days past three", () => {
    expect(describeOwnChangedDays(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"])).toBe(
      "Your shifts changed on Mon, Nov 2, Tue, Nov 3, Wed, Nov 4 and 1 more day",
    );
  });

  it("says nothing with no days", () => {
    expect(describeOwnChangedDays([])).toBeNull();
  });
});

describe("groupPublishesByPeriod", () => {
  const entries = [
    entry({
      startDate: "2026-11-08",
      endDate: "2026-11-14",
      changes: [change({ date: "2026-11-09" }), change({ empId: "a", date: "2026-11-10" })],
    }),
    entry({
      startDate: "2026-11-08",
      endDate: "2026-11-14",
      publishedAt: "2026-11-02T10:00:00.000Z",
      changes: [change({ empId: "b", date: "2026-11-11" })],
    }),
    entry({ changes: [change({ empId: "a" }), change({ empId: "b" })] }),
  ];

  it("counts everyone's changes per period for an editor", () => {
    expect(groupPublishesByPeriod(entries, { seesOrgChanges: true, empId: "me" })).toEqual([
      {
        key: "2026-11-01_2026-11-07",
        startDate: "2026-11-01",
        endDate: "2026-11-07",
        changeCount: 2,
      },
      {
        key: "2026-11-08_2026-11-14",
        startDate: "2026-11-08",
        endDate: "2026-11-14",
        changeCount: 3,
      },
    ]);
  });

  it("counts staff's own days and leaves out periods with none of theirs", () => {
    expect(groupPublishesByPeriod(entries, { seesOrgChanges: false, empId: "me" })).toEqual([
      {
        key: "2026-11-08_2026-11-14",
        startDate: "2026-11-08",
        endDate: "2026-11-14",
        changeCount: 1,
      },
    ]);
  });
});

describe("describeOtherPeriodPublishes", () => {
  const group = { key: "k", startDate: "2026-11-08", endDate: "2026-11-14", changeCount: 3 };

  it("gives an editor the organization's count", () => {
    expect(describeOtherPeriodPublishes([group, group], "week", true)).toBe(
      "6 changes in 2 other weeks",
    );
  });

  it("tells staff only that their shifts changed", () => {
    expect(describeOtherPeriodPublishes([group], "pay period", false)).toBe(
      "Your shifts changed in 1 other pay period",
    );
  });
});

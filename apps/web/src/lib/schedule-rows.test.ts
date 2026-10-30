import { describe, expect, it } from "vitest";
import { buildScheduleWeeks, weekStartOf } from "@/lib/schedule-rows";
import type { ShiftRecord } from "@/lib/shift-records";
import type { TimeOffEntry } from "@/lib/time-off";

const record = (date: string, overrides: Partial<ShiftRecord> = {}): ShiftRecord => ({
  date,
  shifts: [{ name: "Day Shift", jobName: "Mentor", time: "7:00 AM - 3:30 PM" }],
  focusArea: null,
  hours: 8,
  state: "published",
  draftKind: null,
  was: null,
  correctionReason: null,
  absenceName: null,
  noteCount: 0,
  ...overrides,
});

const timeOff = (overrides: Partial<TimeOffEntry>): TimeOffEntry => ({
  key: "a",
  kind: "absence",
  name: "Vacation",
  detail: null,
  startDate: "2026-10-27",
  endDate: "2026-10-27",
  days: 1,
  state: "taken",
  ...overrides,
});

describe("weekStartOf", () => {
  it("starts the week on Sunday", () => {
    expect(weekStartOf("2026-10-29")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-25");
    expect(weekStartOf("2026-10-31")).toBe("2026-10-25");
  });
});

describe("buildScheduleWeeks", () => {
  const today = "2026-10-29";

  it("groups shifts and time off into named weeks, newest first", () => {
    const weeks = buildScheduleWeeks(
      [record("2026-11-02"), record("2026-10-30"), record("2026-10-20"), record("2026-10-05")],
      [timeOff({ startDate: "2026-10-27", endDate: "2026-10-27" })],
      today,
    );
    expect(weeks.map((week) => [week.label, week.span])).toEqual([
      ["Next week", "Nov 1 - 7"],
      ["This week", "Oct 25 - 31"],
      ["Last week", "Oct 18 - 24"],
      ["Week of Oct 4", "Oct 4 - 10"],
    ]);
    expect(weeks[1].rows.map((row) => row.dateLabel)).toEqual(["Fri, Oct 30", "Tue, Oct 27"]);
  });

  it("spells out each shift with its job and times, and pills only what needs a second look", () => {
    const [week] = buildScheduleWeeks(
      [
        record("2026-10-30"),
        record("2026-10-29", { state: "draft", draftKind: "new" }),
        record("2026-10-27", {
          state: "corrected",
          was: "Day Shift",
          correctionReason: "Left early",
          absenceName: "Sick",
          noteCount: 2,
        }),
      ],
      [],
      today,
    );
    expect(week.rows[0]).toMatchObject({
      title: "Day Shift, Mentor",
      detail: "7:00 AM - 3:30 PM",
      pill: null,
    });
    expect(week.rows[1].pill).toEqual({ label: "Draft: new", tone: "neutral" });
    expect(week.rows[2]).toMatchObject({
      detail: "7:00 AM - 3:30 PM · then Sick · was Day Shift · Left early · 2 schedule notes",
      pill: { label: "Corrected", tone: "info" },
    });
  });

  it("names a shift once when its job has the same name", () => {
    const [week] = buildScheduleWeeks(
      [record("2026-10-25", { shifts: [{ name: "Office", jobName: "Office", time: null }] })],
      [],
      today,
    );
    expect(week.rows[0]).toMatchObject({ title: "Office", detail: null });
  });

  it("names time off by its dates and days, and marks what's ahead or happening now", () => {
    const [nextWeek, thisWeek] = buildScheduleWeeks(
      [],
      [
        timeOff({
          key: "away",
          kind: "away",
          name: "Away",
          detail: "Personal",
          startDate: "2026-11-01",
          endDate: "2026-11-06",
          days: 6,
          state: "planned",
        }),
        timeOff({ key: "taken", startDate: "2026-10-26", endDate: "2026-10-26", days: 1 }),
        timeOff({
          key: "now",
          name: "Sick",
          startDate: "2026-10-28",
          endDate: "2026-11-03",
          days: 7,
          state: "now",
        }),
      ],
      today,
    );
    expect(nextWeek.rows[0]).toMatchObject({
      dateLabel: "Nov 1 - 6",
      title: "Away",
      detail: "Personal · 6 days",
      pill: { label: "Planned", tone: "warning" },
    });
    expect(thisWeek.rows.map((row) => [row.dateLabel, row.pill?.label ?? null])).toEqual([
      ["Oct 28 - Nov 3", "Now"],
      ["Mon, Oct 26", null],
    ]);
  });

  it("reads time away with no end as from its first day", () => {
    const [week] = buildScheduleWeeks(
      [],
      [
        timeOff({
          kind: "away",
          name: "Away",
          startDate: "2026-10-28",
          endDate: "2026-10-28",
          days: null,
          state: "now",
        }),
      ],
      today,
    );
    expect(week.rows[0].dateLabel).toBe("From Wed, Oct 28");
  });
});

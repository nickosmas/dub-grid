import { describe, expect, it } from "vitest";
import type { ScheduleNote } from "@/types";
import {
  dashboardScheduleWindow,
  scheduleNoteMarksBySegment,
  scheduleNoteMarksLabel,
} from "./dashboardScheduleNotes";
import type { IndicatorType } from "@/types";

const day = { shiftId: 34, jobId: 18 };
const evening = { shiftId: 35, jobId: 18 };

function note(
  indicatorTypeId: number,
  shift: { shiftId: number | null; jobId: number } = day,
  status: ScheduleNote["status"] = "published",
  overrides: Partial<ScheduleNote> = {},
): ScheduleNote {
  return {
    id: indicatorTypeId * 100 + (shift.shiftId ?? 0),
    orgId: "org-1",
    empId: "emp-1",
    date: "2026-09-28",
    indicatorTypeId,
    focusAreaId: 21,
    shiftId: shift.shiftId,
    jobId: shift.jobId,
    status,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-09-27T00:00:00Z",
    updatedAt: "2026-09-27T00:00:00Z",
    ...overrides,
  };
}

function marks(input: {
  notes: ScheduleNote[];
  shifts: ({ shiftId: number | null; jobId: number } | null)[];
  isScheduleEditor?: boolean;
}) {
  return scheduleNoteMarksBySegment({
    empId: "emp-1",
    dateKey: "2026-09-28",
    isScheduleEditor: input.isScheduleEditor ?? false,
    notes: input.notes,
    segments: input.shifts.map((shift) => ({ shift })),
  });
}

describe("scheduleNoteMarksBySegment", () => {
  it("gives a single shift its own notes, once each", () => {
    const result = marks({ notes: [note(1), note(2), note(1)], shifts: [day] });

    expect(result).toEqual([
      [
        { indicatorTypeId: 1, state: "published" },
        { indicatorTypeId: 2, state: "published" },
      ],
    ]);
  });

  it("gives each note to its own shift of a double shift, even of one type on both", () => {
    const result = marks({
      notes: [note(1, evening), note(2, day), note(1, day)],
      shifts: [day, evening],
    });

    expect(result).toEqual([
      [
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 1, state: "published" },
      ],
      [{ indicatorTypeId: 1, state: "published" }],
    ]);
  });

  it("shows a note whose shift the day no longer has nowhere", () => {
    const result = marks({
      notes: [note(1, { shiftId: 99, jobId: 18 }), note(2, { shiftId: 34, jobId: 7 })],
      shifts: [day, evening],
    });

    expect(result).toEqual([[], []]);
  });

  it("matches a shiftless job's note by its job", () => {
    const shiftless = { shiftId: null, jobId: 16 };

    expect(marks({ notes: [note(1, shiftless)], shifts: [shiftless] })).toEqual([
      [{ indicatorTypeId: 1, state: "published" }],
    ]);
  });

  it("shows an editor the drafts and a viewer only what is published", () => {
    const notes = [note(1, day, "draft"), note(2, day, "draft_deleted"), note(3, day)];

    expect(marks({ notes, shifts: [day], isScheduleEditor: true })).toEqual([
      [
        { indicatorTypeId: 1, state: "draft_added" },
        { indicatorTypeId: 3, state: "published" },
      ],
    ]);
    expect(marks({ notes, shifts: [day] })).toEqual([
      [
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 3, state: "published" },
      ],
    ]);
  });

  it("shows nothing without halves (an absence or a removed shift)", () => {
    expect(marks({ notes: [note(1)], shifts: [] })).toEqual([]);
  });

  it("ignores other people's notes and other days'", () => {
    const result = marks({
      notes: [
        note(1, day, "published", { empId: "emp-2" }),
        note(2, day, "published", { date: "2026-09-29" }),
      ],
      shifts: [day],
    });

    expect(result).toEqual([[]]);
  });

  it("shows nothing without a linked employee", () => {
    expect(
      scheduleNoteMarksBySegment({
        notes: [note(1)],
        empId: null,
        dateKey: "2026-09-28",
        segments: [{ shift: day }],
        isScheduleEditor: false,
      }),
    ).toEqual([]);
  });
});

describe("dashboardScheduleWindow", () => {
  const prevPeriodStart = new Date("2026-09-20T00:00:00");
  const periodEnd = new Date("2026-10-03T00:00:00");

  it("covers the previous period's start to this period's end", () => {
    expect(
      dashboardScheduleWindow({
        todayKey: "2026-09-28",
        isUserDashboardMode: false,
        prevPeriodStart,
        periodEnd,
        heroLookaheadDays: 21,
      }),
    ).toEqual({ start: "2026-09-20", end: "2026-10-03" });
  });

  it("widens the user dashboard's window to the hero's lookahead", () => {
    expect(
      dashboardScheduleWindow({
        todayKey: "2026-09-28",
        isUserDashboardMode: true,
        prevPeriodStart,
        periodEnd,
        heroLookaheadDays: 21,
      }),
    ).toEqual({ start: "2026-09-20", end: "2026-10-19" });
  });
});

describe("scheduleNoteMarksLabel", () => {
  const types = [
    { id: 1, name: "Float" },
    { id: 2, name: "Training" },
  ] as IndicatorType[];

  it("names each note with an editor's draft state, comma-separated", () => {
    expect(
      scheduleNoteMarksLabel(
        [
          { indicatorTypeId: 1, state: "published" },
          { indicatorTypeId: 2, state: "draft_added" },
        ],
        types,
      ),
    ).toBe("Float, Training (added, not published)");
  });

  it("names an unknown note generically", () => {
    expect(scheduleNoteMarksLabel([{ indicatorTypeId: 8, state: "published" }], types)).toBe(
      "Schedule note",
    );
  });
});

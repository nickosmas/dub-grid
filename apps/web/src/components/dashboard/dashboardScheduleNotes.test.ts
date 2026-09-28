import { describe, expect, it } from "vitest";
import type { ScheduleNote } from "@/types";
import {
  dashboardScheduleWindow,
  scheduleNoteMarksBySegment,
  scheduleNoteMarksLabel,
} from "./dashboardScheduleNotes";
import type { IndicatorType } from "@/types";

function note(
  indicatorTypeId: number,
  focusAreaId: number | null,
  status: ScheduleNote["status"] = "published",
  overrides: Partial<ScheduleNote> = {},
): ScheduleNote {
  return {
    id: indicatorTypeId * 100 + (focusAreaId ?? 0),
    orgId: "org-1",
    empId: "emp-1",
    date: "2026-09-28",
    indicatorTypeId,
    focusAreaId,
    shiftId: null,
    jobId: null,
    status,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-09-27T00:00:00Z",
    updatedAt: "2026-09-27T00:00:00Z",
    ...overrides,
  };
}

function marks({
  segmentFocusAreaIds,
  segmentShifts = [],
  ...input
}: {
  notes: ScheduleNote[];
  segmentFocusAreaIds: (number | null)[];
  segmentShifts?: ({ shiftId: number | null; jobId: number } | null)[];
  isScheduleEditor?: boolean;
}) {
  return scheduleNoteMarksBySegment({
    empId: "emp-1",
    dateKey: "2026-09-28",
    isScheduleEditor: false,
    segments: segmentFocusAreaIds.map((focusAreaId, index) => ({
      focusAreaId,
      shift: segmentShifts[index] ?? null,
    })),
    ...input,
  });
}

describe("scheduleNoteMarksBySegment", () => {
  it("gives a single shift every note of the person's day, once each", () => {
    const result = marks({
      notes: [note(1, 10), note(2, null), note(1, 10), note(3, 99)],
      segmentFocusAreaIds: [10],
    });

    expect(result).toEqual([
      [
        { indicatorTypeId: 1, state: "published" },
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 3, state: "published" },
      ],
    ]);
  });

  it("gives a note to its own shift of a double shift in one focus area", () => {
    const day = { shiftId: 34, jobId: 18 };
    const evening = { shiftId: 35, jobId: 18 };
    const result = marks({
      notes: [
        note(1, 21, "published", { shiftId: 35, jobId: 18 }),
        note(2, 21, "published", { id: 2, shiftId: 34, jobId: 18 }),
        note(1, 21, "published", { id: 3, shiftId: 34, jobId: 18 }),
      ],
      segmentFocusAreaIds: [21, 21],
      segmentShifts: [day, evening],
    });

    // The same note type on both shifts shows on both halves.
    expect(result).toEqual([
      [
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 1, state: "published" },
      ],
      [{ indicatorTypeId: 1, state: "published" }],
    ]);
  });

  it("falls back to the focus area for a note no shift claims or a shift it no longer has", () => {
    const result = marks({
      notes: [note(1, 21), note(2, 21, "published", { shiftId: 99, jobId: 18 })],
      segmentFocusAreaIds: [22, 21],
      segmentShifts: [
        { shiftId: 36, jobId: 18 },
        { shiftId: 35, jobId: 18 },
      ],
    });

    expect(result).toEqual([
      [],
      [
        { indicatorTypeId: 1, state: "published" },
        { indicatorTypeId: 2, state: "published" },
      ],
    ]);
  });

  it("gives a double shift's focus-area notes to the half working that area", () => {
    const result = marks({
      notes: [note(1, 20), note(2, 10), note(3, null), note(4, 99)],
      segmentFocusAreaIds: [10, 20],
    });

    // Area 20's note on the second half; area 10's, the whole-day note and the
    // note for an area neither half works on the first.
    expect(result).toEqual([
      [
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 3, state: "published" },
        { indicatorTypeId: 4, state: "published" },
      ],
      [{ indicatorTypeId: 1, state: "published" }],
    ]);
  });

  it("puts a note on the first half working its area when both halves do", () => {
    const result = marks({ notes: [note(1, 10)], segmentFocusAreaIds: [10, 10] });

    expect(result).toEqual([[{ indicatorTypeId: 1, state: "published" }], []]);
  });

  it("shows an editor the drafts and a viewer only what is published", () => {
    const notes = [note(1, null, "draft"), note(2, null, "draft_deleted"), note(3, null)];

    expect(marks({ notes, segmentFocusAreaIds: [null], isScheduleEditor: true })).toEqual([
      [
        { indicatorTypeId: 1, state: "draft_added" },
        { indicatorTypeId: 3, state: "published" },
      ],
    ]);
    expect(marks({ notes, segmentFocusAreaIds: [null] })).toEqual([
      [
        { indicatorTypeId: 2, state: "published" },
        { indicatorTypeId: 3, state: "published" },
      ],
    ]);
  });

  it("shows nothing without halves (an absence or a removed shift)", () => {
    expect(marks({ notes: [note(1, null)], segmentFocusAreaIds: [] })).toEqual([]);
  });

  it("ignores other people's notes and other days'", () => {
    const result = marks({
      notes: [
        note(1, null, "published", { empId: "emp-2" }),
        note(2, null, "published", { date: "2026-09-29" }),
      ],
      segmentFocusAreaIds: [null],
    });

    expect(result).toEqual([[]]);
  });

  it("shows nothing without a linked employee", () => {
    expect(
      scheduleNoteMarksBySegment({
        notes: [note(1, null)],
        empId: null,
        dateKey: "2026-09-28",
        segments: [{ focusAreaId: null, shift: null }],
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

import { describe, expect, it } from "vitest";
import type { NotePublishChange, ScheduleNote } from "@/types";
import {
  buildScheduleNoteMap,
  buildScheduleNoteMarks,
  removeScheduleNotesForCell,
  scheduleNoteKey,
} from "./schedule-window";

function note(overrides: Partial<ScheduleNote>): ScheduleNote {
  return {
    id: 1,
    orgId: "org-1",
    empId: "emp-1",
    date: "2026-08-03",
    indicatorTypeId: 10,
    focusAreaId: 5,
    status: "published",
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scheduleNoteKey", () => {
  it("qualifies the key with the focus area when there is one", () => {
    expect(scheduleNoteKey("emp-1", "2026-08-03", 5)).toBe("emp-1_2026-08-03_5");
  });

  // A null focus area is not the same cell as focus area 0 — the two-part
  // fallback is what the grid looks up for org-wide notes.
  it("falls back to the two-part key when the focus area is null", () => {
    expect(scheduleNoteKey("emp-1", "2026-08-03", null)).toBe("emp-1_2026-08-03");
  });

  it("keeps focus area 0 in the key rather than treating it as absent", () => {
    expect(scheduleNoteKey("emp-1", "2026-08-03", 0)).toBe("emp-1_2026-08-03_0");
  });
});

describe("buildScheduleNoteMap", () => {
  it("returns an empty map for no rows", () => {
    expect(buildScheduleNoteMap([])).toEqual({});
  });

  it("groups several indicators on one cell into one entry", () => {
    const map = buildScheduleNoteMap([
      note({ id: 1, indicatorTypeId: 10 }),
      note({ id: 2, indicatorTypeId: 11, status: "draft" }),
    ]);

    expect(map).toEqual({
      "emp-1_2026-08-03_5": [
        { indicatorTypeId: 10, status: "published", updatedBy: null },
        { indicatorTypeId: 11, status: "draft", updatedBy: null },
      ],
    });
  });

  it("keeps the same employee and date apart when the focus area differs", () => {
    const map = buildScheduleNoteMap([
      note({ id: 1, focusAreaId: 5 }),
      note({ id: 2, focusAreaId: 6 }),
    ]);

    expect(Object.keys(map).sort()).toEqual(["emp-1_2026-08-03_5", "emp-1_2026-08-03_6"]);
  });

  it("keeps a null-focus-area note separate from a focus-area-scoped one", () => {
    const map = buildScheduleNoteMap([
      note({ id: 1, focusAreaId: null }),
      note({ id: 2, focusAreaId: 5 }),
    ]);

    expect(map["emp-1_2026-08-03"]).toEqual([
      { indicatorTypeId: 10, status: "published", updatedBy: null },
    ]);
    expect(map["emp-1_2026-08-03_5"]).toEqual([
      { indicatorTypeId: 10, status: "published", updatedBy: null },
    ]);
  });

  it("carries draft_deleted through, since the grid renders it distinctly", () => {
    const map = buildScheduleNoteMap([note({ status: "draft_deleted" })]);
    expect(map["emp-1_2026-08-03_5"]).toEqual([
      { indicatorTypeId: 10, status: "draft_deleted", updatedBy: null },
    ]);
  });

  it("carries note authorship through so drafts can be attributed", () => {
    const map = buildScheduleNoteMap([
      note({ id: 1, indicatorTypeId: 10, status: "draft", updatedBy: "user-1" }),
      // An older note may predate authorship tracking; it must still map.
      note({ id: 2, indicatorTypeId: 11, status: "draft", updatedBy: null }),
    ]);

    expect(map["emp-1_2026-08-03_5"]).toEqual([
      { indicatorTypeId: 10, status: "draft", updatedBy: "user-1" },
      { indicatorTypeId: 11, status: "draft", updatedBy: null },
    ]);
  });

  it("preserves row order within a cell", () => {
    const map = buildScheduleNoteMap([
      note({ id: 1, indicatorTypeId: 30 }),
      note({ id: 2, indicatorTypeId: 10 }),
      note({ id: 3, indicatorTypeId: 20 }),
    ]);
    expect(map["emp-1_2026-08-03_5"].map((n) => n.indicatorTypeId)).toEqual([30, 10, 20]);
  });
});

function publishedNoteChange(overrides: Partial<NotePublishChange>): NotePublishChange {
  return {
    empId: "emp-1",
    date: "2026-08-03",
    kind: "new",
    indicatorTypeId: 10,
    focusAreaId: 5,
    indicatorName: "Float",
    indicatorColor: "#ff0000",
    ...overrides,
  };
}

describe("removeScheduleNotesForCell", () => {
  const entry = [{ indicatorTypeId: 10, status: "published" as const, updatedBy: null }];

  it("clears every focus area a cell holds without touching other cells", () => {
    const notes = {
      "emp-1_2026-08-03_5": entry,
      "emp-1_2026-08-03_6": entry,
      "emp-1_2026-08-04_5": entry,
      "emp-2_2026-08-03_5": entry,
    };

    expect(removeScheduleNotesForCell(notes, "emp-1", "2026-08-03")).toEqual({
      "emp-1_2026-08-04_5": entry,
      "emp-2_2026-08-03_5": entry,
    });
  });

  it("clears a cell whose notes carry no focus area", () => {
    expect(
      removeScheduleNotesForCell({ "emp-1_2026-08-03": entry }, "emp-1", "2026-08-03"),
    ).toEqual({});
  });

  it("returns the same map when the cell has no notes, so callers can skip a render", () => {
    const notes = { "emp-1_2026-08-03_5": entry };

    expect(removeScheduleNotesForCell(notes, "emp-2", "2026-08-03")).toBe(notes);
  });

  it("does not treat a longer employee id as the same cell", () => {
    const notes = { "emp-10_2026-08-03_5": entry };

    expect(removeScheduleNotesForCell(notes, "emp-1", "2026-08-03")).toBe(notes);
  });
});

describe("buildScheduleNoteMarks", () => {
  it("marks an added and a removed draft note for a scheduler", () => {
    const marks = buildScheduleNoteMarks({
      notes: [
        { indicatorTypeId: 10, status: "draft", updatedBy: null },
        { indicatorTypeId: 11, status: "draft_deleted", updatedBy: null },
        { indicatorTypeId: 12, status: "published", updatedBy: null },
      ],
      isScheduleEditor: true,
    });

    expect(marks).toEqual([
      { indicatorTypeId: 10, state: "draft_added" },
      { indicatorTypeId: 11, state: "draft_removed" },
      { indicatorTypeId: 12, state: "published" },
    ]);
  });

  // Unpublished note state is scheduler-only, the same way draft shift state is.
  it("hides unpublished note state from a viewer", () => {
    const marks = buildScheduleNoteMarks({
      notes: [
        { indicatorTypeId: 10, status: "draft", updatedBy: null },
        { indicatorTypeId: 11, status: "draft_deleted", updatedBy: null },
      ],
      isScheduleEditor: false,
    });

    expect(marks).toEqual([{ indicatorTypeId: 11, state: "published" }]);
  });

  it("promotes a note the last publish added", () => {
    const marks = buildScheduleNoteMarks({
      notes: [
        { indicatorTypeId: 10, status: "published", updatedBy: null },
        { indicatorTypeId: 11, status: "published", updatedBy: null },
      ],
      publishedChanges: new Map([[10, publishedNoteChange({})]]),
      isScheduleEditor: true,
    });

    expect(marks).toEqual([
      { indicatorTypeId: 10, state: "published_added" },
      { indicatorTypeId: 11, state: "published" },
    ]);
  });

  it("renders a removed published note from its change record", () => {
    const marks = buildScheduleNoteMarks({
      notes: undefined,
      publishedChanges: new Map([
        [
          10,
          publishedNoteChange({ kind: "deleted", indicatorName: "Gone", indicatorColor: "#0f0" }),
        ],
      ]),
      isScheduleEditor: true,
    });

    expect(marks).toEqual([
      {
        indicatorTypeId: 10,
        state: "published_removed",
        name: "Gone",
        color: "#0f0",
      },
    ]);
  });

  it("does not ghost a removed note that has been added back", () => {
    const marks = buildScheduleNoteMarks({
      notes: [{ indicatorTypeId: 10, status: "draft", updatedBy: null }],
      publishedChanges: new Map([[10, publishedNoteChange({ kind: "deleted" })]]),
      isScheduleEditor: true,
    });

    expect(marks).toEqual([{ indicatorTypeId: 10, state: "draft_added" }]);
  });
});

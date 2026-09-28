import { describe, expect, it } from "vitest";

import {
  activeNoteIds,
  cloneDraftNotes,
  computeScheduleEntryDraftKind,
  dropNotesOfRemovedShifts,
  planNoteWrites,
  shiftEditableIdentityMatches,
  toggleDraftNote,
  type DraftNoteState,
} from "./editor-session";
import type { ShiftMap } from "@/types";

function makeShiftEntry(overrides: Partial<ShiftMap[string]> = {}): ShiftMap[string] {
  return {
    draft: null,
    published: null,
    effective: null,
    label: "Day - Staff",
    segments: [
      {
        shiftId: 10,
        jobId: 100,
        position: 0,
        label: "Day - Staff",
        isMentored: false,
      },
    ],
    assignmentIds: [1],
    isDraft: false,
    isDelete: false,
    draftKind: null,
    publishedAssignmentDefinitionIds: [1],
    publishedSegments: [
      {
        shiftId: 10,
        jobId: 100,
        position: 0,
        label: "Day - Staff",
        isMentored: false,
      },
    ],
    publishedLabel: "Day - Staff",
    customStartTime: null,
    customEndTime: null,
    publishedCustomStartTime: null,
    publishedCustomEndTime: null,
    absenceTypeId: null,
    publishedAbsenceTypeId: null,
    ...overrides,
  };
}

describe("schedule editor session helpers", () => {
  it("classifies mentored-only shift edits as modified drafts", () => {
    const entry = makeShiftEntry({
      segments: [
        {
          shiftId: 10,
          jobId: 100,
          position: 0,
          label: "Day - Staff",
          isMentored: true,
        },
      ],
    });

    expect(computeScheduleEntryDraftKind(entry)).toBe("modified");
  });

  it("treats mentored-only shift edits as editable identity changes", () => {
    const base = makeShiftEntry();
    const draft = makeShiftEntry({
      segments: [
        {
          shiftId: 10,
          jobId: 100,
          position: 0,
          label: "Day - Staff",
          isMentored: true,
        },
      ],
    });

    expect(shiftEditableIdentityMatches(base, draft)).toBe(false);
  });

  it("classifies an entry matching its published state as no draft at all", () => {
    // What the grid's drag-drop relies on: dropping a shift onto the cell that
    // already published that exact shift leaves nothing to publish, so the cell
    // must not come back wearing a draft border.
    expect(computeScheduleEntryDraftKind(makeShiftEntry())).toBeNull();
  });

  it("keeps time-only edits out of editable identity comparisons", () => {
    const base = makeShiftEntry({ customStartTime: "07:00" });
    const draft = makeShiftEntry({ customStartTime: "08:00" });

    expect(shiftEditableIdentityMatches(base, draft)).toBe(true);
  });
});

describe("schedule notes per shift", () => {
  const day = { shiftId: 34, jobId: 18 };
  const evening = { shiftId: 35, jobId: 18 };
  const onShift = (
    indicatorTypeId: number,
    shift: { shiftId: number | null; jobId: number },
    status: DraftNoteState["status"] = "published",
  ): DraftNoteState => ({ indicatorTypeId, status, ...shift });

  it("turns a note on for one shift of a double shift and leaves the other off", () => {
    const notes = toggleDraftNote([], 1, true, evening);

    expect(activeNoteIds(notes, evening)).toEqual([1]);
    expect(activeNoteIds(notes, day)).toEqual([]);
  });

  it("turns off a published note by marking it, and undoes it", () => {
    const start = [onShift(1, day), onShift(1, evening)];

    const off = toggleDraftNote(start, 1, false, day);
    expect(off).toEqual([onShift(1, day, "draft_deleted"), onShift(1, evening)]);
    expect(activeNoteIds(off, day)).toEqual([]);
    expect(activeNoteIds(off, evening)).toEqual([1]);
    expect(toggleDraftNote(off, 1, true, day)).toEqual(start);
  });

  it("drops a draft note outright when it is turned off", () => {
    expect(toggleDraftNote([onShift(1, day, "draft")], 1, false, day)).toEqual([]);
  });

  it("drops a map entry that names no shift", () => {
    expect(
      cloneDraftNotes([
        { indicatorTypeId: 1, status: "published", shiftId: 34, jobId: 18 },
        { indicatorTypeId: 2, status: "published" },
      ]),
    ).toEqual([onShift(1, day)]);
  });

  it("drops only a removed shift's notes: a draft goes, a published one waits", () => {
    const notes = [onShift(1, day, "draft"), onShift(2, day), onShift(3, evening, "draft")];

    expect(dropNotesOfRemovedShifts(notes, [evening])).toEqual([
      onShift(2, day, "draft_deleted"),
      onShift(3, evening, "draft"),
    ]);
  });

  it("plans one write per changed note, carrying its shift", () => {
    const { writes, results } = planNoteWrites(
      { 21: [onShift(1, day)] },
      { 21: [onShift(1, day), onShift(1, evening, "draft")] },
    );

    expect(writes).toEqual([
      {
        kind: "upsert",
        focusAreaId: 21,
        indicatorTypeId: 1,
        shift: evening,
        baseStatus: undefined,
      },
    ]);
    expect(results.get(21)).toEqual([onShift(1, day), onShift(1, evening, "draft")]);
  });

  it("plans the delete that marks a published note and restores one pending removal", () => {
    const { writes, results } = planNoteWrites(
      { 21: [onShift(1, day), onShift(2, evening, "draft_deleted")] },
      { 21: [onShift(1, day, "draft_deleted"), onShift(2, evening)] },
    );

    expect(writes.map((write) => [write.kind, write.indicatorTypeId, write.baseStatus])).toEqual([
      ["delete", 1, "published"],
      ["upsert", 2, "draft_deleted"],
    ]);
    expect(results.get(21)).toEqual([onShift(1, day, "draft_deleted"), onShift(2, evening)]);
  });
});

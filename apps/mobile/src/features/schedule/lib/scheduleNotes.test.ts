import { describe, expect, it } from "vitest";
import type { MobileScheduleEntrySegment, MobileScheduleIndicator } from "@dubgrid/contracts";
import {
  scheduleNoteGroups,
  scheduleNotesForSegment,
  scheduleNotesSpokenLabel,
  scheduleNoteLabel,
  scheduleNotesForRow,
} from "./scheduleNotes";

const note = (
  indicatorTypeId: number,
  focusAreaId: number | null,
  state: MobileScheduleIndicator["state"] = "published",
): MobileScheduleIndicator => ({
  indicatorTypeId,
  focusAreaId,
  name: `Note ${indicatorTypeId}`,
  color: "#E24B4A",
  state,
});

describe("scheduleNotesForRow", () => {
  const notes = [note(1, 10), note(2, 20), note(3, null), note(1, 20)];

  it("shows every note once without a focus area", () => {
    expect(scheduleNotesForRow(notes).map((n) => n.indicatorTypeId)).toEqual([1, 2, 3]);
  });

  it("shows a focus area's notes and those with none", () => {
    expect(scheduleNotesForRow(notes, 10).map((n) => n.indicatorTypeId)).toEqual([1, 3]);
    expect(scheduleNotesForRow(notes, 20).map((n) => n.indicatorTypeId)).toEqual([2, 3, 1]);
  });

  it("keeps a draft beside the published note of the same type", () => {
    expect(scheduleNotesForRow([note(1, 10), note(1, 10, "draft_removed")])).toHaveLength(2);
  });

  it("returns nothing for no notes", () => {
    expect(scheduleNotesForRow(undefined)).toEqual([]);
    expect(scheduleNotesForRow([])).toEqual([]);
  });
});

describe("scheduleNoteLabel", () => {
  it("names a note and any draft state", () => {
    expect(scheduleNoteLabel(note(1, null))).toBe("Note 1");
    expect(scheduleNoteLabel(note(1, null, "draft_added"))).toBe("Note 1, added, not published");
    expect(scheduleNoteLabel(note(1, null, "draft_removed"))).toBe(
      "Note 1, removed, not published",
    );
  });
});

describe("scheduleNoteGroups", () => {
  const day = {
    focusAreaId: 21,
    displayFocusAreaName: "Skilled Nursing",
    shiftName: "Day Shift",
    shiftId: 34,
    jobId: 18,
  } as MobileScheduleEntrySegment;
  const evening = { ...day, shiftName: "Evening Shift", shiftId: 35 };
  const onShift = (indicatorTypeId: number, shiftId: number): MobileScheduleIndicator => ({
    ...note(indicatorTypeId, 21),
    shiftId,
    jobId: 18,
  });

  it("gives a single shift one untitled group, and none without notes", () => {
    expect(scheduleNoteGroups([onShift(1, 34), onShift(2, 34)], [day])).toEqual([
      { key: "shift", title: null, notes: [onShift(1, 34), onShift(2, 34)] },
    ]);
    expect(scheduleNoteGroups([], [day])).toEqual([]);
    expect(scheduleNoteGroups(undefined, [])).toEqual([]);
  });

  it("lists a double shift's notes under the shift each belongs to", () => {
    const groups = scheduleNoteGroups(
      [onShift(1, 35), onShift(2, 34), onShift(3, 35)],
      [day, evening],
    );

    expect(groups.map((group) => [group.title, group.notes.map((n) => n.indicatorTypeId)])).toEqual(
      [
        ["Day Shift", [2]],
        ["Evening Shift", [1, 3]],
      ],
    );
  });

  it("leaves out a half without notes and a note for a shift the day no longer has", () => {
    expect(scheduleNoteGroups([onShift(1, 35), onShift(2, 99)], [day, evening])).toEqual([
      { key: "shift-1", title: "Evening Shift", notes: [onShift(1, 35)] },
    ]);
  });

  it("titles a half without a shift name by its focus area", () => {
    const unnamed = { ...evening, shiftName: "" };
    expect(scheduleNoteGroups([onShift(1, 35)], [day, unnamed])[0]?.title).toBe("Skilled Nursing");
  });

  it("gives a note only to its own half, and a single shift all of them", () => {
    const notes = [onShift(1, 35), onShift(2, 34)];

    expect(scheduleNotesForSegment(notes, [day, evening], 0).map((n) => n.indicatorTypeId)).toEqual(
      [2],
    );
    expect(scheduleNotesForSegment(notes, [day, evening], 1).map((n) => n.indicatorTypeId)).toEqual(
      [1],
    );
    expect(scheduleNotesForSegment(notes, [day], 0)).toHaveLength(2);
  });
});

describe("scheduleNotesSpokenLabel", () => {
  it("reads every note with its draft state", () => {
    expect(
      scheduleNotesSpokenLabel([note(1, null), { ...note(2, null), state: "draft_added" }]),
    ).toBe("Schedule notes: Note 1; Note 2, added, not published");
  });
});

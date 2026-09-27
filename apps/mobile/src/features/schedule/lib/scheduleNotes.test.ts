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
  const segment = (focusAreaId: number | null, name: string): MobileScheduleEntrySegment =>
    ({
      focusAreaId,
      displayFocusAreaName: name,
      shiftName: "Day Shift",
    }) as MobileScheduleEntrySegment;

  it("gives a single shift one untitled group, and none without notes", () => {
    expect(scheduleNoteGroups([note(1, 2), note(2, null)], [segment(2, "ICU")])).toEqual([
      { key: "shift", title: null, notes: [note(1, 2), note(2, null)] },
    ]);
    expect(scheduleNoteGroups([], [segment(2, "ICU")])).toEqual([]);
    expect(scheduleNoteGroups(undefined, [])).toEqual([]);
  });

  it("groups a double shift by focus area, then the whole day", () => {
    const groups = scheduleNoteGroups(
      [note(1, 2), note(2, 3), note(3, null), note(4, 9)],
      [segment(2, "ICU"), segment(3, "Rehab")],
    );
    expect(groups.map((group) => [group.title, group.notes.map((n) => n.indicatorTypeId)])).toEqual(
      [
        ["ICU", [1]],
        ["Rehab", [2]],
        ["For the whole day", [3, 4]],
      ],
    );
  });

  it("lists a focus area worked twice once and leaves out empty halves", () => {
    const groups = scheduleNoteGroups(
      [note(1, 2)],
      [segment(2, "ICU"), segment(2, "ICU"), segment(3, "Rehab")],
    );
    expect(groups).toEqual([{ key: "area-2", title: "ICU", notes: [note(1, 2)] }]);
  });

  it("keeps a note type filed under two focus areas in both halves", () => {
    const groups = scheduleNoteGroups(
      [note(1, 2), note(1, 3), note(1, null)],
      [segment(2, "ICU"), segment(3, "Rehab")],
    );
    expect(groups.map((group) => [group.title, group.notes])).toEqual([
      ["ICU", [note(1, 2)]],
      ["Rehab", [note(1, 3)]],
      ["For the whole day", [note(1, null)]],
    ]);
  });
});

describe("scheduleNotesForSegment", () => {
  const segment = (focusAreaId: number | null): MobileScheduleEntrySegment =>
    ({ focusAreaId }) as MobileScheduleEntrySegment;
  const notes = [note(1, 2), note(2, 3), note(3, null), note(4, 9)];

  it("gives each note to one half: its area's first half, the day's to the first", () => {
    const segments = [segment(2), segment(3)];
    expect(scheduleNotesForSegment(notes, segments, 0).map((n) => n.indicatorTypeId)).toEqual([
      1, 3, 4,
    ]);
    expect(scheduleNotesForSegment(notes, segments, 1).map((n) => n.indicatorTypeId)).toEqual([2]);
  });

  it("lists a focus area worked twice on its first half only", () => {
    const segments = [segment(3), segment(3)];
    expect(scheduleNotesForSegment(notes, segments, 1)).toEqual([]);
  });

  it("gives a single shift all its notes", () => {
    expect(scheduleNotesForSegment(notes, [segment(2)], 0)).toHaveLength(4);
  });
});

describe("schedule notes on a double shift in one focus area", () => {
  const day = {
    focusAreaId: 21,
    displayFocusAreaName: "Skilled Nursing",
    shiftName: "Day Shift",
    shiftId: 34,
    jobId: 18,
  } as MobileScheduleEntrySegment;
  const evening = { ...day, shiftName: "Evening Shift", shiftId: 35 };
  const onShift = (indicatorTypeId: number, shiftId: number | null): MobileScheduleIndicator => ({
    ...note(indicatorTypeId, 21),
    shiftId,
    jobId: shiftId == null ? null : 18,
  });

  it("lists each shift's own notes under that shift, and the area's under the area", () => {
    const groups = scheduleNoteGroups(
      [onShift(1, 35), onShift(2, 34), onShift(3, null)],
      [day, evening],
    );

    expect(groups.map((group) => [group.title, group.notes.map((n) => n.indicatorTypeId)])).toEqual(
      [
        ["Day Shift", [2]],
        ["Skilled Nursing", [3]],
        ["Evening Shift", [1]],
      ],
    );
  });

  it("gives a note only to its own half", () => {
    const notes = [onShift(1, 35), onShift(3, null)];

    expect(scheduleNotesForSegment(notes, [day, evening], 0).map((n) => n.indicatorTypeId)).toEqual(
      [3],
    );
    expect(scheduleNotesForSegment(notes, [day, evening], 1).map((n) => n.indicatorTypeId)).toEqual(
      [1],
    );
  });

  it("files a note for a shift the cell no longer has under its focus area", () => {
    const groups = scheduleNoteGroups([onShift(1, 99)], [day, evening]);

    expect(groups).toEqual([{ key: "area-21", title: "Skilled Nursing", notes: [onShift(1, 99)] }]);
  });
});

describe("scheduleNotesSpokenLabel", () => {
  it("reads every note with its draft state", () => {
    expect(
      scheduleNotesSpokenLabel([note(1, null), { ...note(2, null), state: "draft_added" }]),
    ).toBe("Schedule notes: Note 1; Note 2, added, not published");
  });
});

import { describe, expect, it } from "vitest";
import type { MobileScheduleEntrySegment, MobileScheduleIndicator } from "@dubgrid/contracts";
import {
  scheduleNoteGroups,
  scheduleNoteLabel,
  scheduleNoteSwatchStyle,
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

describe("scheduleNoteSwatchStyle", () => {
  it("fills a published note, fades a draft addition and rings a draft removal", () => {
    expect(scheduleNoteSwatchStyle(note(1, null), "#fff")).toEqual({
      backgroundColor: "#E24B4A",
      borderColor: "#fff",
      borderWidth: 1,
      opacity: 1,
    });
    expect(scheduleNoteSwatchStyle(note(1, null, "draft_added"), "#fff").opacity).toBe(0.45);
    expect(scheduleNoteSwatchStyle(note(1, null, "draft_removed"), "#fff")).toEqual({
      backgroundColor: "transparent",
      borderColor: "#E24B4A",
      borderWidth: 1.5,
      opacity: 1,
    });
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
});

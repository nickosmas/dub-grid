import { describe, expect, it } from "vitest";
import {
  isNotePublishChangeRow,
  toNotePublishChanges,
  toPublishChanges,
  type ScheduleChangeRow,
} from "./publish-history";

function makeRow(overrides: Partial<ScheduleChangeRow>): ScheduleChangeRow {
  return {
    emp_id: "emp-1",
    date: "2026-05-04",
    kind: "new",
    from_state: null,
    to_state: null,
    from_absence_type_id: null,
    to_absence_type_id: null,
    updated_by: null,
    from_custom_start: null,
    from_custom_end: null,
    to_custom_start: null,
    to_custom_end: null,
    ...overrides,
  };
}

const noteState = {
  type: "note",
  indicatorTypeId: 7,
  focusAreaId: 3,
  indicatorName: "Float",
  indicatorColor: "#ff0000",
};

const cellRow = makeRow({
  kind: "modified",
  to_state: { kind: "worked", segments: [{ shiftId: 1, jobId: 2, position: 0 }] },
});

describe("publish change rows", () => {
  it("drops a modified row whose before and after states are the same schedule", () => {
    const segments = [{ shiftId: 1, jobId: 2, position: 0, isMentored: false }];
    const changes = toPublishChanges([
      makeRow({
        kind: "modified",
        from_state: { kind: "worked", segments, customStartTime: "07:00", customEndTime: null },
        to_state: { kind: "worked", segments, customStartTime: "07:00", customEndTime: null },
      }),
      makeRow({
        kind: "modified",
        from_state: { kind: "worked", segments },
        to_state: { kind: "worked", segments: [{ ...segments[0], isMentored: true }] },
      }),
      makeRow({
        kind: "modified",
        from_state: { kind: "absence", segments: [], absenceTypeId: 4 },
        to_state: { kind: "absence", segments: [], absenceTypeId: 4 },
      }),
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0].toState?.segments[0].isMentored).toBe(true);
  });

  it("keeps note rows out of the cell changes", () => {
    const changes = toPublishChanges([
      cellRow,
      makeRow({ to_state: noteState }),
      makeRow({ kind: "deleted", from_state: noteState }),
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("modified");
  });

  it("maps an added note from its to_state", () => {
    const [change] = toNotePublishChanges([
      cellRow,
      makeRow({ to_state: noteState, updated_by: "user-1" }),
    ]);

    expect(change).toEqual({
      empId: "emp-1",
      date: "2026-05-04",
      kind: "new",
      indicatorTypeId: 7,
      focusAreaId: 3,
      indicatorName: "Float",
      indicatorColor: "#ff0000",
      updatedBy: "user-1",
    });
  });

  it("maps a removed note from its from_state", () => {
    const [change] = toNotePublishChanges([makeRow({ kind: "deleted", from_state: noteState })]);

    expect(change.kind).toBe("deleted");
    expect(change.indicatorName).toBe("Float");
  });

  it("recognises a note row from either direction", () => {
    expect(isNotePublishChangeRow(makeRow({ to_state: noteState }))).toBe(true);
    expect(isNotePublishChangeRow(makeRow({ from_state: noteState }))).toBe(true);
    expect(isNotePublishChangeRow(cellRow)).toBe(false);
  });
});

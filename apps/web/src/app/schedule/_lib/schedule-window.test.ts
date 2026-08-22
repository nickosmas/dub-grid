import { describe, expect, it } from "vitest";
import type { ScheduleNote } from "@/types";
import { buildScheduleNoteMap, scheduleNoteKey } from "./schedule-window";

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
        { indicatorTypeId: 10, status: "published" },
        { indicatorTypeId: 11, status: "draft" },
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

    expect(map["emp-1_2026-08-03"]).toEqual([{ indicatorTypeId: 10, status: "published" }]);
    expect(map["emp-1_2026-08-03_5"]).toEqual([{ indicatorTypeId: 10, status: "published" }]);
  });

  it("carries draft_deleted through, since the grid renders it distinctly", () => {
    const map = buildScheduleNoteMap([note({ status: "draft_deleted" })]);
    expect(map["emp-1_2026-08-03_5"]).toEqual([{ indicatorTypeId: 10, status: "draft_deleted" }]);
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

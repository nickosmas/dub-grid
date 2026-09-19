import { describe, expect, it } from "vitest";
import type { ShiftMap } from "@/types";
import { computeDraftBreakdown } from "@/lib/draft-utils";
import {
  UNATTRIBUTED_EDITOR_ID,
  computeEditorDraftBreakdowns,
  formatEditorBreakdownSummary,
} from "@/lib/publish-attribution";

const WINDOW = { startDateKey: "2026-03-01", endDateKey: "2026-03-07" };

const shift = (draftKind: "new" | "modified" | "deleted" | null, updatedBy: string | null) =>
  ({ draftKind, updatedBy }) as unknown as ShiftMap[string];

const note = (status: "draft" | "draft_deleted" | "published", updatedBy: string | null) => ({
  indicatorTypeId: 1,
  status,
  updatedBy,
});

describe("computeEditorDraftBreakdowns", () => {
  it("returns nothing when the window holds no drafts", () => {
    expect(computeEditorDraftBreakdowns({}, {}, "user-1", WINDOW)).toEqual([]);
  });

  it("splits shift changes by author with the right kinds", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", "user-1"),
      "emp-2_2026-03-03": shift("modified", "user-1"),
      "emp-3_2026-03-04": shift("deleted", "user-2"),
    };

    const rows = computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW);

    expect(rows).toEqual([
      expect.objectContaining({
        editorId: "user-1",
        isCurrentUser: true,
        newShifts: 1,
        modifiedShifts: 1,
        deletedShifts: 0,
        totalChanges: 2,
      }),
      expect.objectContaining({
        editorId: "user-2",
        isCurrentUser: false,
        deletedShifts: 1,
        totalChanges: 1,
      }),
    ]);
  });

  it("attributes notes to their author", () => {
    const notes = {
      "emp-1_2026-03-02_5": [note("draft", "user-2"), note("draft_deleted", "user-1")],
      "emp-2_2026-03-03": [note("published", "user-2")],
    };

    const rows = computeEditorDraftBreakdowns({}, notes, "user-1", WINDOW);
    const byId = new Map(rows.map((r) => [r.editorId, r]));

    expect(byId.get("user-1")).toEqual(expect.objectContaining({ deletedNotes: 1, newNotes: 0 }));
    expect(byId.get("user-2")).toEqual(expect.objectContaining({ newNotes: 1, deletedNotes: 0 }));
    // A published note is not an unpublished change.
    expect(byId.get("user-2")?.totalChanges).toBe(1);
  });

  it("keeps unattributed changes visible instead of dropping them", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", null),
      "emp-2_2026-03-03": shift("new", "user-1"),
    };

    const rows = computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW);
    const unknown = rows.find((r) => r.editorId === UNATTRIBUTED_EDITOR_ID);

    expect(unknown).toEqual(expect.objectContaining({ newShifts: 1, isCurrentUser: false }));
    // Unknown authorship sorts last so it never displaces a named editor.
    expect(rows[rows.length - 1]?.editorId).toBe(UNATTRIBUTED_EDITOR_ID);
  });

  it("puts the current user first even with fewer changes", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", "user-1"),
      "emp-2_2026-03-03": shift("new", "user-2"),
      "emp-3_2026-03-04": shift("new", "user-2"),
      "emp-4_2026-03-05": shift("new", "user-2"),
    };

    const rows = computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW);

    expect(rows.map((r) => r.editorId)).toEqual(["user-1", "user-2"]);
  });

  it("orders by volume when no row belongs to the current user", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", "user-2"),
      "emp-2_2026-03-03": shift("new", "user-3"),
      "emp-3_2026-03-04": shift("new", "user-3"),
    };

    const rows = computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW);

    expect(rows.map((r) => r.editorId)).toEqual(["user-3", "user-2"]);
  });

  it("attributes a shift added beside a published one as new, matching the headline", () => {
    const doubleShift = {
      ...shift("modified", "user-2"),
      assignmentIds: [1, 2],
      segments: [
        { shiftId: 1, jobId: 10, label: "D" },
        { shiftId: 2, jobId: 10, label: "E" },
      ],
      publishedAssignmentDefinitionIds: [1],
      publishedSegments: [{ shiftId: 1, jobId: 10, label: "D" }],
    } as unknown as ShiftMap[string];
    const shifts: ShiftMap = { "emp-1_2026-03-02": doubleShift };

    const rows = computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW);
    const overall = computeDraftBreakdown(shifts, {}, WINDOW);

    expect(rows).toEqual([
      expect.objectContaining({
        editorId: "user-2",
        newShifts: 1,
        modifiedShifts: 0,
        totalChanges: 1,
      }),
    ]);
    expect(overall.newShifts).toBe(1);
    expect(overall.modifiedShifts).toBe(0);
  });

  it("ignores changes outside the publish window", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", "user-1"),
      "emp-2_2026-04-20": shift("new", "user-1"),
    };
    const notes = { "emp-3_2026-04-21_5": [note("draft", "user-1")] };

    const rows = computeEditorDraftBreakdowns(shifts, notes, "user-1", WINDOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].totalChanges).toBe(1);
  });

  it("ignores cells with no draft at all", () => {
    const shifts: ShiftMap = { "emp-1_2026-03-02": shift(null, "user-1") };

    expect(computeEditorDraftBreakdowns(shifts, {}, "user-1", WINDOW)).toEqual([]);
  });

  // The per-editor rows are shown next to the headline count, so any drift
  // between the two would be visible and wrong.
  it("totals exactly match the overall breakdown for the same window", () => {
    const shifts: ShiftMap = {
      "emp-1_2026-03-02": shift("new", "user-1"),
      "emp-2_2026-03-03": shift("modified", "user-2"),
      "emp-3_2026-03-04": shift("deleted", null),
      "emp-4_2026-04-01": shift("new", "user-1"),
    };
    const notes = {
      "emp-1_2026-03-02_5": [note("draft", "user-2"), note("draft_deleted", null)],
      "emp-9_2026-04-02_5": [note("draft", "user-1")],
    };

    const overall = computeDraftBreakdown(shifts, notes, WINDOW);
    const rows = computeEditorDraftBreakdowns(shifts, notes, "user-1", WINDOW);
    const sum = (pick: (r: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);

    expect(sum((r) => r.newShifts)).toBe(overall.newShifts);
    expect(sum((r) => r.modifiedShifts)).toBe(overall.modifiedShifts);
    expect(sum((r) => r.deletedShifts)).toBe(overall.deletedShifts);
    expect(sum((r) => r.newNotes)).toBe(overall.newNotes);
    expect(sum((r) => r.deletedNotes)).toBe(overall.deletedNotes);
    expect(sum((r) => r.totalChanges)).toBe(overall.totalChanges);
  });

  it("treats a null current user as nobody being the current user", () => {
    const shifts: ShiftMap = { "emp-1_2026-03-02": shift("new", "user-1") };

    const rows = computeEditorDraftBreakdowns(shifts, {}, null, WINDOW);

    expect(rows[0].isCurrentUser).toBe(false);
  });
});

describe("formatEditorBreakdownSummary", () => {
  const base = {
    editorId: "user-1",
    isCurrentUser: true,
    newShifts: 0,
    modifiedShifts: 0,
    deletedShifts: 0,
    newNotes: 0,
    deletedNotes: 0,
    totalChanges: 0,
  };

  it("lists shift kinds with a single pluralised noun", () => {
    expect(formatEditorBreakdownSummary({ ...base, newShifts: 2, modifiedShifts: 1 })).toBe(
      "2 new, 1 edited shifts",
    );
  });

  it("keeps the singular for one shift", () => {
    expect(formatEditorBreakdownSummary({ ...base, newShifts: 1 })).toBe("1 new shift");
  });

  it("appends notes after shifts", () => {
    expect(formatEditorBreakdownSummary({ ...base, newShifts: 1, newNotes: 2 })).toBe(
      "1 new shift, 2 new notes",
    );
  });

  it("reports notes alone when there are no shift changes", () => {
    expect(formatEditorBreakdownSummary({ ...base, deletedNotes: 1 })).toBe("1 removed note");
  });

  it("falls back to a plain phrase when nothing changed", () => {
    expect(formatEditorBreakdownSummary(base)).toBe("No unpublished changes");
  });
});

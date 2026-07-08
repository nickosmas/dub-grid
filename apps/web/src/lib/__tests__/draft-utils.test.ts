import { describe, expect, it } from "vitest";
import {
  computeDraftBreakdown,
  computeOutOfWindowDraftGroups,
  extractDateKeyFromCellKey,
} from "@/lib/draft-utils";
import type { ShiftMap } from "@/types";

function shiftEntry(
  draftKind: ShiftMap[string]["draftKind"],
  overrides: Partial<ShiftMap[string]> = {},
): ShiftMap[string] {
  return {
    label: "Day",
    assignmentIds: [1],
    isDraft: draftKind !== null,
    draftKind,
    publishedAssignmentDefinitionIds: [],
    publishedLabel: "",
    ...overrides,
  };
}

const weekOf = (dateKey: string) => {
  // crude "week" key for tests — bucket by 7-day boundary from epoch
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - dayOfWeek);
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
};

const parseWeekKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

describe("extractDateKeyFromCellKey", () => {
  it("parses an emp+date shift key", () => {
    expect(extractDateKeyFromCellKey("emp-abc_2026-05-17")).toBe("2026-05-17");
  });
  it("parses a note key with a focus area suffix", () => {
    expect(extractDateKeyFromCellKey("emp-abc_2026-05-17_42")).toBe("2026-05-17");
  });
  it("returns null when no recognizable date is present", () => {
    expect(extractDateKeyFromCellKey("emp-abc")).toBeNull();
    expect(extractDateKeyFromCellKey("emp-abc_garbage")).toBeNull();
  });
});

describe("computeDraftBreakdown", () => {
  const shifts: ShiftMap = {
    "e1_2026-05-17": shiftEntry("new"),
    "e1_2026-05-18": shiftEntry("modified"),
    "e1_2026-05-19": shiftEntry("deleted"),
    "e1_2026-05-20": shiftEntry(null), // not a draft
    "e1_2026-06-05": shiftEntry("new"), // out of window
  };
  const notes = {
    "e1_2026-05-17": [
      { indicatorTypeId: 1, status: "draft" as const },
      { indicatorTypeId: 2, status: "published" as const },
    ],
    "e1_2026-06-05_3": [{ indicatorTypeId: 1, status: "draft" as const }],
  };

  it("counts all drafts when no date range is provided", () => {
    const result = computeDraftBreakdown(shifts, notes);
    expect(result).toMatchObject({
      newShifts: 2,
      modifiedShifts: 1,
      deletedShifts: 1,
      newNotes: 2,
      deletedNotes: 0,
      totalChanges: 6,
    });
  });

  it("restricts the count to the given inclusive date range", () => {
    const result = computeDraftBreakdown(shifts, notes, {
      startDateKey: "2026-05-17",
      endDateKey: "2026-05-30",
    });
    expect(result).toMatchObject({
      newShifts: 1,
      modifiedShifts: 1,
      deletedShifts: 1,
      newNotes: 1,
      deletedNotes: 0,
      totalChanges: 4,
    });
  });

  it("returns zero when no drafts fall in the range", () => {
    const result = computeDraftBreakdown(shifts, notes, {
      startDateKey: "2026-07-01",
      endDateKey: "2026-07-31",
    });
    expect(result.totalChanges).toBe(0);
  });
});

describe("computeOutOfWindowDraftGroups", () => {
  const shifts: ShiftMap = {
    "e1_2026-05-17": shiftEntry("new"), // in window
    "e1_2026-05-18": shiftEntry("modified"), // in window
    "e1_2026-05-03": shiftEntry("new"), // out of window, week of 2026-05-03
    "e1_2026-05-04": shiftEntry("new"), // out of window, same week
    "e1_2026-05-31": shiftEntry("modified"), // out of window, week of 2026-05-31
    "e1_2026-06-01": shiftEntry(null), // not a draft — ignored
  };
  const notes = {
    "e1_2026-05-03": [{ indicatorTypeId: 1, status: "draft" as const }],
    "e1_2026-05-17": [{ indicatorTypeId: 2, status: "draft" as const }],
  };

  it("groups out-of-window drafts by period and sorts chronologically", () => {
    const result = computeOutOfWindowDraftGroups(
      shifts,
      notes,
      { startDateKey: "2026-05-17", endDateKey: "2026-05-30" },
      weekOf,
      parseWeekKey,
    );
    expect(result.map((g) => g.periodKey)).toEqual(["2026-05-03", "2026-05-31"]);
    // Week of 5/3: 2 shifts + 1 note = 3 drafts
    expect(result[0]?.count).toBe(3);
    // Week of 5/31: 1 shift
    expect(result[1]?.count).toBe(1);
    expect(result[0]?.periodStart).toEqual(parseWeekKey("2026-05-03"));
  });

  it("returns empty array when all drafts fall within the window", () => {
    const result = computeOutOfWindowDraftGroups(
      { "e1_2026-05-20": shiftEntry("new") },
      {},
      { startDateKey: "2026-05-17", endDateKey: "2026-05-30" },
      weekOf,
      parseWeekKey,
    );
    expect(result).toEqual([]);
  });

  it("excludes shift entries with no draft from the count", () => {
    const result = computeOutOfWindowDraftGroups(
      {
        "e1_2026-05-03": shiftEntry(null),
        "e1_2026-05-04": shiftEntry("new"),
      },
      {},
      { startDateKey: "2026-05-17", endDateKey: "2026-05-30" },
      weekOf,
      parseWeekKey,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(1);
  });

  it("reproduces the bug: 27 drafts outside the publish window leave the banner non-zero after publish", () => {
    // Simulate post-publish state: in-window drafts are gone (RPC cleared them).
    // Pre-existing out-of-window drafts remain across multiple weeks.
    const postPublishShifts: ShiftMap = {};
    // 12 drafts in week of 2026-05-03
    for (let i = 3; i <= 9; i++) {
      postPublishShifts[`e1_2026-05-${String(i).padStart(2, "0")}`] = shiftEntry(
        i % 2 === 0 ? "new" : "modified",
      );
    }
    // 15 drafts in week of 2026-05-31
    for (let i = 31; i <= 31; i++) {
      postPublishShifts[`e1_2026-05-${String(i).padStart(2, "0")}`] = shiftEntry("new");
    }
    for (let i = 1; i <= 6; i++) {
      postPublishShifts[`e2_2026-06-${String(i).padStart(2, "0")}`] = shiftEntry("new");
    }

    const inWindow = computeDraftBreakdown(
      postPublishShifts,
      {},
      {
        startDateKey: "2026-05-17",
        endDateKey: "2026-05-30",
      },
    );
    expect(inWindow.totalChanges).toBe(0); // banner correctly empty post-publish

    const groups = computeOutOfWindowDraftGroups(
      postPublishShifts,
      {},
      { startDateKey: "2026-05-17", endDateKey: "2026-05-30" },
      weekOf,
      parseWeekKey,
    );
    expect(groups.length).toBeGreaterThan(0);
    const total = groups.reduce((s, g) => s + g.count, 0);
    expect(total).toBeGreaterThan(0);
  });
});

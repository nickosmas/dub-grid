import { describe, expect, it } from "vitest";
import type { ShiftMap } from "@/types";
import {
  computeDraftBreakdown,
  computeOutOfWindowDraftGroups,
  countDraftEntryChanges,
  countShiftsAddedToPublishedCell,
  countShiftsAddedToPublishedEntry,
} from "./draft-utils";

const day = { shiftId: 1, jobId: 10 };
const evening = { shiftId: 2, jobId: 10 };

function side(
  segments: Array<{ shiftId: number | null; jobId: number; isMentored?: boolean }>,
  overrides: Partial<{
    absenceTypeId: number | null;
    customStartTime: string | null;
    customEndTime: string | null;
  }> = {},
) {
  return {
    segments,
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    ...overrides,
  };
}

describe("countShiftsAddedToPublishedCell", () => {
  it("counts a shift added beside a published one as new", () => {
    expect(countShiftsAddedToPublishedCell(side([day]), side([day, evening]))).toBe(1);
  });

  it("keeps a replacement an edit", () => {
    expect(countShiftsAddedToPublishedCell(side([day]), side([evening]))).toBe(0);
  });

  it("keeps a reorder an edit", () => {
    expect(countShiftsAddedToPublishedCell(side([day]), side([evening, day]))).toBe(0);
  });

  it("keeps a removal an edit", () => {
    expect(countShiftsAddedToPublishedCell(side([day, evening]), side([day]))).toBe(0);
  });

  it("keeps an added shift an edit when the published one was retimed", () => {
    expect(
      countShiftsAddedToPublishedCell(
        side([day], { customStartTime: "07:00", customEndTime: "15:00" }),
        side([day, evening], { customStartTime: "08:00|", customEndTime: "15:00|" }),
      ),
    ).toBe(0);
  });

  it("ignores the delimiter the second segment adds to custom times", () => {
    expect(
      countShiftsAddedToPublishedCell(
        side([day], { customStartTime: "07:00", customEndTime: "15:00" }),
        side([day, evening], { customStartTime: "07:00|", customEndTime: "15:00|" }),
      ),
    ).toBe(1);
  });

  it("keeps an added shift an edit when the published one changed mentoring", () => {
    expect(
      countShiftsAddedToPublishedCell(side([day]), side([{ ...day, isMentored: true }, evening])),
    ).toBe(0);
  });

  it("is not new when nothing was published", () => {
    expect(countShiftsAddedToPublishedCell(side([]), side([day]))).toBe(0);
  });
});

describe("computeDraftBreakdown", () => {
  const baseEntry: ShiftMap[string] = {
    label: "D/E",
    assignmentIds: [1, 2],
    segments: [
      { ...day, label: "D" },
      { ...evening, label: "E" },
    ],
    isDraft: true,
    draftKind: "modified",
    publishedAssignmentDefinitionIds: [1],
    publishedSegments: [{ ...day, label: "D" }],
    publishedLabel: "D",
  };

  it("reports a double shift as one new shift, not an edit", () => {
    expect(countShiftsAddedToPublishedEntry(baseEntry)).toBe(1);
    const breakdown = computeDraftBreakdown({ "emp_2026-09-18": baseEntry }, {});
    expect(breakdown.newShifts).toBe(1);
    expect(breakdown.modifiedShifts).toBe(0);
    expect(breakdown.totalChanges).toBe(1);
  });

  it("still reports a replaced shift as an edit", () => {
    const replaced: ShiftMap[string] = {
      ...baseEntry,
      assignmentIds: [2],
      segments: [{ ...evening, label: "E" }],
    };
    const breakdown = computeDraftBreakdown({ "emp_2026-09-18": replaced }, {});
    expect(breakdown.newShifts).toBe(0);
    expect(breakdown.modifiedShifts).toBe(1);
  });

  it("counts an out-of-window double shift the same way as the headline", () => {
    const groups = computeOutOfWindowDraftGroups(
      { "emp_2026-09-25": baseEntry },
      {},
      { startDateKey: "2026-09-14", endDateKey: "2026-09-20" },
      (dateKey) => dateKey.slice(0, 7),
      (periodKey) => new Date(`${periodKey}-01T00:00:00`),
    );
    expect(countDraftEntryChanges(baseEntry)).toBe(1);
    expect(groups).toEqual([
      { periodKey: "2026-09", periodStart: new Date("2026-09-01T00:00:00"), count: 1 },
    ]);
  });
});

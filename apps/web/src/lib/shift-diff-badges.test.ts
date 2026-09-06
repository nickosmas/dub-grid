import { describe, expect, it } from "vitest";

import { buildShiftDiffDescriptors } from "./shift-diff-badges";

const resolveAssignmentDefinitionLabel = (id: number) =>
  ({ 1: "DAY", 2: "NIGHT", 3: "SWING" })[id] ?? `?${id}`;
const resolveAbsenceLabel = (id: number) =>
  ({ 10: "Sick", 11: "Vacation", 12: "PTO" })[id] ?? `?${id}`;

describe("buildShiftDiffDescriptors — absence cells", () => {
  it("flags a newly added absence as a cell-level 'New' badge with no pill diffs", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: null },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge).toEqual({
      kind: "new",
      text: "New",
      detail: "Added Sick.",
    });
  });

  it("flags a replaced absence as an Edited cell badge while retaining its prior value in detail", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: 11 },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge?.kind).toBe("modified");
    expect(result.cellBadge?.text).toBe("Edited");
    expect(result.cellBadge?.detail).toBe("Was Vacation.");
  });

  it("flags a shift replaced by an absence as Edited while retaining its prior value in detail", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], absenceTypeId: null },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge?.kind).toBe("modified");
    expect(result.cellBadge?.text).toBe("Edited");
    expect(result.cellBadge?.detail).toBe("Was DAY.");
  });

  it("returns null cellBadge when before and after are the same absence", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: 10 },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge).toBeNull();
  });
});

describe("buildShiftDiffDescriptors — shift cells (sanity)", () => {
  it("emits a pill diff for a newly added single shift so the regular pill-level badge path still triggers", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: null },
      after: { assignmentIds: [1], absenceTypeId: null },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toHaveLength(1);
    expect(result.pillDiffs[0]).toEqual({
      borderKind: "new",
      badge: { kind: "new", text: "New", detail: "Added DAY." },
    });
  });

  it("emits a modified pill diff when a single shift is swapped for another", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], absenceTypeId: null },
      after: { assignmentIds: [2], absenceTypeId: null },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toHaveLength(1);
    expect(result.pillDiffs[0]?.borderKind).toBe("modified");
    expect(result.pillDiffs[0]?.badge?.text).toBe("Edited");
    expect(result.pillDiffs[0]?.badge?.detail).toBe("Was DAY.");
  });

  it("treats an absence replaced by a shift as a non-empty pill diff so the regular code path renders the ring", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: 10 },
      after: { assignmentIds: [1], absenceTypeId: null },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toHaveLength(1);
    expect(result.pillDiffs[0]?.borderKind).toBe("modified");
    expect(result.pillDiffs[0]?.badge?.text).toBe("Edited");
    expect(result.pillDiffs[0]?.badge?.detail).toBe("Was Sick.");
  });

  it("never exposes an unresolved prior assignment as a question-mark label", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [99], absenceTypeId: null },
      after: { assignmentIds: [1], absenceTypeId: null },
      resolveAssignmentDefinitionLabel: () => "?",
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]?.badge).toEqual({
      kind: "modified",
      text: "Edited",
      detail: "Replaced a previous assignment.",
    });
  });
});

describe("buildShiftDiffDescriptors — mentored flag", () => {
  it("names a pill that became mentored", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], isMentoredFlags: [false] },
      after: { assignmentIds: [1], isMentoredFlags: [true] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]?.borderKind).toBe("modified");
    expect(result.pillDiffs[0]?.badge).toEqual({
      kind: "modified",
      text: "+ Mentored",
      detail: "Marked mentored.",
    });
    expect(result.cellBadge?.detail).toBe("Marked mentored.");
  });

  it("names a pill that stopped being mentored", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], isMentoredFlags: [true] },
      after: { assignmentIds: [1], isMentoredFlags: [false] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]?.badge?.text).toBe("\u2212 Mentored");
    expect(result.pillDiffs[0]?.badge?.detail).toBe("Removed mentored.");
  });

  it("keeps both edits in the tooltip when the time changed too", () => {
    const result = buildShiftDiffDescriptors({
      before: {
        assignmentIds: [1],
        isMentoredFlags: [false],
        timeRanges: [{ start: "07:00", end: "15:00" }],
      },
      after: {
        assignmentIds: [1],
        isMentoredFlags: [true],
        timeRanges: [{ start: "08:00", end: "16:00" }],
      },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]?.badge?.text).toBe("Time");
    expect(result.pillDiffs[0]?.badge?.detail).toBe(
      "Changed custom time 07:00-15:00 to 08:00-16:00. Marked mentored.",
    );
  });

  it("says nothing about a pill whose mentored flag did not move", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], isMentoredFlags: [true] },
      after: { assignmentIds: [1], isMentoredFlags: [true] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]).toEqual({ borderKind: null, badge: null });
    expect(result.cellBadge).toBeNull();
  });
});

describe("buildShiftDiffDescriptors — custom time", () => {
  it("signs a removed custom time so it cannot be read as a changed one", () => {
    const removed = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], timeRanges: [{ start: "07:00", end: "15:00" }] },
      after: { assignmentIds: [1], timeRanges: [{ start: null, end: null }] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });
    const changed = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], timeRanges: [{ start: "07:00", end: "15:00" }] },
      after: { assignmentIds: [1], timeRanges: [{ start: "08:00", end: "16:00" }] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(removed.pillDiffs[0]?.badge?.text).toBe("\u2212 Time");
    expect(removed.pillDiffs[0]?.badge?.detail).toBe("Removed custom time.");
    expect(changed.pillDiffs[0]?.badge?.text).toBe("Time");
    expect(removed.pillDiffs[0]?.badge?.text).not.toBe(changed.pillDiffs[0]?.badge?.text);
  });

  it("signs an added custom time the same way", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], timeRanges: [{ start: null, end: null }] },
      after: { assignmentIds: [1], timeRanges: [{ start: "08:00", end: "16:00" }] },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs[0]?.badge?.text).toBe("+ Time");
  });
});

describe("buildShiftDiffDescriptors — removed split-shift segments", () => {
  it("marks a removed sibling as Edited without marking the surviving shift", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1, 2], absenceTypeId: null },
      after: { assignmentIds: [1], absenceTypeId: null },
      beforeShiftLabels: ["Day Shift · Mentor", "Evening Shift · Supervisor"],
      afterShiftLabels: ["Day Shift · Mentor"],
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([{ borderKind: null, badge: null }]);
    expect(result.cellBadge).toEqual({
      kind: "modified",
      text: "Changed",
      detail: "Was Evening Shift · Supervisor.",
    });
  });
});

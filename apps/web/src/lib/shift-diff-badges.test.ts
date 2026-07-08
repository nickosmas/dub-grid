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

  it("flags a replaced absence as a cell-level 'Was <label>' modified badge with no pill diffs", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [], absenceTypeId: 11 },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge?.kind).toBe("modified");
    expect(result.cellBadge?.text).toBe("Was Vacation");
  });

  it("flags a shift replaced by an absence as a cell-level 'Was <shift>' modified badge with no pill diffs", () => {
    const result = buildShiftDiffDescriptors({
      before: { assignmentIds: [1], absenceTypeId: null },
      after: { assignmentIds: [], absenceTypeId: 10 },
      resolveAssignmentDefinitionLabel,
      resolveAbsenceLabel,
    });

    expect(result.pillDiffs).toEqual([]);
    expect(result.cellBadge?.kind).toBe("modified");
    expect(result.cellBadge?.text).toBe("Was DAY");
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
    expect(result.pillDiffs[0]?.badge?.text).toBe("Was DAY");
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
    expect(result.pillDiffs[0]?.badge?.text).toBe("Was Sick");
  });
});

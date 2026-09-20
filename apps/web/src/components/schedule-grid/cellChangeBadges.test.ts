import { describe, expect, it } from "vitest";
import type { PublishChange, ScheduleCellState, ScheduleCellStateEntry } from "@/types";
import { resolveCellChangeBadges } from "./cellChangeBadges";

const DAY = 101;
const NIGHT = 202;
// shiftId:jobId pairs the way createAssignmentDefinitionIdByPairMap keys them.
const pairMap = new Map([
  ["10:7", DAY],
  ["20:7", NIGHT],
]);
const labels = new Map([
  [DAY, "Day"],
  [NIGHT, "Night"],
]);

function resolve(input: {
  entry?: Partial<ScheduleCellStateEntry> | null;
  publishChange?: Partial<PublishChange> | null;
  pillCount: number;
}) {
  const entry: ScheduleCellStateEntry | null = input.entry
    ? {
        label: "",
        assignmentIds: [],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
        ...input.entry,
      }
    : null;
  const publishChange: PublishChange | null = input.publishChange
    ? { empId: "emp-1", date: "2026-05-11", kind: "modified", ...input.publishChange }
    : null;
  return resolveCellChangeBadges({
    entry,
    publishChange,
    pillCount: input.pillCount,
    publishedAssignmentIdByPair: pairMap,
    resolveAssignmentLabel: (id) => labels.get(id) ?? "?",
    resolveAbsenceLabel: () => "Vacation",
  });
}

const segment = (shiftId: number, position: number, isMentored = false) => ({
  shiftId,
  jobId: 7,
  position,
  isMentored,
  label: shiftId === 10 ? "D" : "N",
});

const workedState = (segments: ReturnType<typeof segment>[]): ScheduleCellState => ({
  kind: "worked",
  segments,
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
});

describe("resolveCellChangeBadges: drafts", () => {
  it("dashes a new draft without a chip, as the grid does", () => {
    const result = resolve({
      entry: { assignmentIds: [DAY], label: "D", isDraft: true, draftKind: "new" },
      pillCount: 1,
    });
    expect(result.pillBadges).toEqual([null]);
    expect(result.pillBorderKinds).toEqual(["new"]);
  });

  it("marks only the replaced pill of a double shift", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY, NIGHT],
        label: "D/N",
        segments: [segment(10, 0), segment(20, 1)],
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY, DAY],
        publishedLabel: "D/D",
        publishedSegments: [segment(10, 0), segment(10, 1)],
      },
      pillCount: 2,
    });
    expect(result.pillBadges[0]).toBeNull();
    expect(result.pillBadges[1]).toMatchObject({
      source: "draft",
      kind: "modified",
      label: "Edited",
    });
    expect(result.pillBorderKinds).toEqual([null, "modified"]);
  });

  it("leaves the published sibling alone when a draft adds a second shift", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY, NIGHT],
        label: "D/N",
        segments: [segment(10, 0), segment(20, 1)],
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
        publishedSegments: [segment(10, 0)],
      },
      pillCount: 2,
    });
    expect(result.pillBadges).toEqual([null, null]);
    expect(result.pillBorderKinds).toEqual([null, "new"]);
  });

  it("shows nothing but the dashed border for a draft that matches what was published", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY],
        label: "D",
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
      },
      pillCount: 1,
    });
    expect(result.pillBadges).toEqual([null]);
    expect(result.pillBorderKinds).toEqual(["modified"]);
  });

  it("badges a draft time change as an edit", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY],
        label: "D",
        isDraft: true,
        draftKind: "modified",
        customStartTime: "07:00",
        customEndTime: "15:00",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({ source: "draft", kind: "time", label: "Edited" });
  });

  it("puts a removed segment's marker on the cell, not the survivor", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY],
        label: "D",
        segments: [segment(10, 0)],
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY, NIGHT],
        publishedLabel: "D/N",
        publishedSegments: [segment(10, 0), segment(20, 1)],
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "draft",
      kind: "modified",
      text: "Changed",
      label: "Edited",
    });
  });

  it("carries a replaced absence on the cell", () => {
    const result = resolve({
      entry: {
        assignmentIds: [],
        absenceTypeId: 5,
        label: "V",
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "draft",
      kind: "modified",
      label: "Edited",
    });
  });

  it("marks a draft deletion on every displayed pill's border and one chip", () => {
    const result = resolve({
      entry: { isDelete: true, isDraft: true, draftKind: "deleted" },
      pillCount: 2,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "draft",
      kind: "deleted",
      label: "Deleted",
    });
    expect(result.pillBadges[1]).toBeNull();
    expect(result.pillBorderKinds).toEqual(["deleted", "deleted"]);
  });
});

describe("resolveCellChangeBadges: publications", () => {
  it("ignores a period's first publication", () => {
    const result = resolve({
      entry: { assignmentIds: [DAY], label: "D", publishedAssignmentDefinitionIds: [DAY] },
      publishChange: { kind: "new", isNewAddition: false, to: [DAY] },
      pillCount: 1,
    });
    expect(result.pillBadges).toEqual([null]);
  });

  it("chips a later addition as New", () => {
    const result = resolve({
      entry: { assignmentIds: [DAY], label: "D", publishedAssignmentDefinitionIds: [DAY] },
      publishChange: { kind: "new", isNewAddition: true, to: [DAY] },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({ source: "publish", kind: "new", label: "New" });
    expect(result.pillBorderKinds).toEqual([null]);
  });

  it("badges a published time change as an edit", () => {
    const result = resolve({
      entry: { assignmentIds: [DAY], label: "D", publishedAssignmentDefinitionIds: [DAY] },
      publishChange: {
        from: [DAY],
        to: [DAY],
        fromCustomStart: "08:00",
        fromCustomEnd: "16:00",
        toCustomStart: "09:00",
        toCustomEnd: "17:00",
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "publish",
      kind: "time",
      label: "Edited",
    });
  });

  it("chips only the added pill when a publication turned one shift into two", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY, NIGHT],
        label: "D/N",
        publishedAssignmentDefinitionIds: [DAY, NIGHT],
      },
      publishChange: { from: [DAY], to: [DAY, NIGHT] },
      pillCount: 2,
    });
    expect(result.pillBadges[0]).toBeNull();
    expect(result.pillBadges[1]).toMatchObject({ source: "publish", kind: "new", label: "New" });
  });

  it("marks a published double shift as one edited pill and one new pill", () => {
    // A published Day became Night plus Evening: the Night replaced the Day,
    // the Evening is an addition. The dashboard used to call both "Edited".
    const EVENING = 303;
    const result = resolve({
      entry: {
        assignmentIds: [NIGHT, EVENING],
        label: "N/E",
        publishedAssignmentDefinitionIds: [NIGHT, EVENING],
      },
      publishChange: { from: [DAY], to: [NIGHT, EVENING] },
      pillCount: 2,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "publish",
      kind: "modified",
      label: "Edited",
      detail: "Was Day.",
    });
    expect(result.pillBadges[1]).toMatchObject({ source: "publish", kind: "new", label: "New" });
  });

  it("marks a draft double shift the same way, minus the New chip the border already says", () => {
    const EVENING = 303;
    const result = resolve({
      entry: {
        assignmentIds: [NIGHT, EVENING],
        label: "N/E",
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
      },
      pillCount: 2,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "draft",
      kind: "modified",
      label: "Edited",
    });
    expect(result.pillBadges[1]).toBeNull();
    expect(result.pillBorderKinds).toEqual(["modified", "new"]);
  });

  it("resolves the before and after shifts from the stored snapshots", () => {
    const result = resolve({
      entry: {
        assignmentIds: [DAY],
        label: "D",
        segments: [segment(10, 0)],
        publishedAssignmentDefinitionIds: [DAY],
      },
      publishChange: {
        fromState: workedState([segment(20, 0)]),
        toState: workedState([segment(10, 0)]),
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "publish",
      kind: "modified",
      label: "Edited",
      detail: "Was Night.",
    });
  });

  it("badges a mentored toggle as an edit", () => {
    const result = resolve({
      entry: { assignmentIds: [DAY], label: "D", segments: [segment(10, 0, true)] },
      publishChange: {
        fromState: workedState([segment(10, 0, false)]),
        toState: workedState([segment(10, 0, true)]),
      },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "publish",
      kind: "modified",
      label: "Edited",
    });
  });

  it("marks a published deletion of a cell that no longer exists", () => {
    const result = resolve({
      entry: null,
      publishChange: { kind: "deleted", from: [DAY] },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({
      source: "publish",
      kind: "deleted",
      label: "Deleted",
    });
    expect(result.pillBorderKinds).toEqual([null]);
  });

  it("lets a draft on the same pill outrank the published chip", () => {
    const result = resolve({
      entry: {
        assignmentIds: [NIGHT],
        label: "N",
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [DAY],
        publishedLabel: "D",
      },
      publishChange: { kind: "new", isNewAddition: true, to: [DAY] },
      pillCount: 1,
    });
    expect(result.pillBadges[0]).toMatchObject({ source: "draft", kind: "modified" });
    expect(result.pillBorderKinds).toEqual(["modified"]);
  });
});

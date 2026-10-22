import { describe, expect, it } from "vitest";
import {
  coverageCellUnchangedText,
  describeCoverageCellChanges,
  type CoverageDaySide,
  type DescribeCoverageCellChangesInput,
} from "./coverage-change-text";
import type { CoverageContributorChange, CoverageMatrixCell } from "./coverage-matrix";

const HERE = "2026-10-23";
const DATE_KEYS = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const NAMES: Record<string, string> = { ana: "Ana Crawford", ben: "Ben Shepherd" };
const ASSIGNMENTS: Record<number, { name: string; focusAreaId: number | null }> = {
  1: { name: "Day Shift · Supervisor", focusAreaId: 49 },
  2: { name: "Evening Shift", focusAreaId: 49 },
  3: { name: "Day Shift", focusAreaId: 50 },
  4: { name: "Office", focusAreaId: null },
  9: { name: "Night Shift (archived)", focusAreaId: 49 },
};
const AREAS: Record<number, string> = { 49: "Skilled Nursing", 50: "Sheltered Care" };
const ABSENCES: Record<number, string> = { 7: "Sick", 8: "Jury Duty (archived)" };
const SHORT_DATES: Record<string, string> = {
  "2026-10-21": "Wed, Oct 21",
  "2026-10-22": "Thu, Oct 22",
  "2026-10-24": "Sat, Oct 24",
  "2026-10-25": "Sun, Oct 25",
};

type Days = Record<string, Partial<CoverageDaySide>>;

function day(days: Days, employeeId: string, dateKey: string): CoverageDaySide {
  const entry = days[`${employeeId}|${dateKey}`];
  return { assignmentIds: entry?.assignmentIds ?? [], absenceTypeId: entry?.absenceTypeId ?? null };
}

function describe1(
  changes: CoverageContributorChange[],
  published: Days,
  draft: Days,
  overrides: Partial<DescribeCoverageCellChangesInput> = {},
): string[] {
  return describeCoverageCellChanges({
    changes,
    focusAreaId: 49,
    dateKey: HERE,
    dateKeys: DATE_KEYS,
    personName: (id) => NAMES[id] ?? null,
    assignmentName: (id) => ASSIGNMENTS[id].name,
    assignmentFocusAreaId: (id) => ASSIGNMENTS[id].focusAreaId,
    focusAreaName: (id) => AREAS[id] ?? null,
    absenceName: (id) => ABSENCES[id],
    draftDay: (employeeId, dateKey) => day(draft, employeeId, dateKey),
    publishedDay: (employeeId, dateKey) => day(published, employeeId, dateKey),
    formatDate: (dateKey) => SHORT_DATES[dateKey],
    ...overrides,
  });
}

const lost = (employeeId: string, assignmentId = 1, draftCredit = 0) => ({
  employeeId,
  publishedAssignmentId: assignmentId,
  draftAssignmentId: draftCredit > 0 ? assignmentId : null,
  publishedCredit: 1,
  draftCredit,
});
const gained = (employeeId: string, assignmentId = 1, publishedCredit = 0, draftCredit = 1) => ({
  employeeId,
  publishedAssignmentId: publishedCredit > 0 ? assignmentId : null,
  draftAssignmentId: assignmentId,
  publishedCredit,
  draftCredit,
});

describe("describeCoverageCellChanges", () => {
  describe("a lost person", () => {
    it("moved to another date", () => {
      expect(
        describe1(
          [lost("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
          { "ana|2026-10-24": { assignmentIds: [1] } },
        ),
      ).toEqual(["Ana Crawford's Day Shift · Supervisor moved to Sat, Oct 24"]);
    });

    it("changed to other work, naming another focus area", () => {
      expect(
        describe1(
          [lost("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
          { [`ana|${HERE}`]: { assignmentIds: [3] } },
        ),
      ).toEqual(["Ana Crawford's Day Shift · Supervisor changed to Day Shift in Sheltered Care"]);
    });

    it("changed to two pieces of work", () => {
      expect(
        describe1(
          [lost("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
          { [`ana|${HERE}`]: { assignmentIds: [2, 4] } },
        ),
      ).toEqual(["Ana Crawford's Day Shift · Supervisor changed to Evening Shift and Office"]);
    });

    it("was given an absence", () => {
      expect(
        describe1(
          [lost("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
          { [`ana|${HERE}`]: { absenceTypeId: 7 } },
        ),
      ).toEqual(["Ana Crawford was given an absence (Sick) instead of Day Shift · Supervisor"]);
    });

    it("is now mentored", () => {
      const days = { [`ana|${HERE}`]: { assignmentIds: [1] } };
      expect(describe1([lost("ana", 1, 0.35)], days, days)).toEqual([
        "Ana Crawford is now mentored on Day Shift · Supervisor, counting 0.35",
      ]);
    });

    it("was taken off", () => {
      expect(describe1([lost("ana")], { [`ana|${HERE}`]: { assignmentIds: [1] } }, {})).toEqual([
        "Ana Crawford was taken off Day Shift · Supervisor",
      ]);
    });

    it("reads as taken off when the move lands outside the loaded dates", () => {
      expect(
        describe1(
          [lost("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
          { "ana|2026-11-02": { assignmentIds: [1] } },
        ),
      ).toEqual(["Ana Crawford was taken off Day Shift · Supervisor"]);
    });
  });

  describe("a gained person", () => {
    it("moved here from another date", () => {
      expect(
        describe1(
          [gained("ana")],
          { "ana|2026-10-21": { assignmentIds: [1] } },
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
        ),
      ).toEqual(["Ana Crawford's Day Shift · Supervisor moved here from Wed, Oct 21"]);
    });

    it("changed from other work in another focus area", () => {
      expect(
        describe1(
          [gained("ana")],
          { [`ana|${HERE}`]: { assignmentIds: [3] } },
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
        ),
      ).toEqual([
        "Ana Crawford changed from Day Shift in Sheltered Care to Day Shift · Supervisor",
      ]);
    });

    it("had an absence replaced", () => {
      expect(
        describe1(
          [gained("ana")],
          { [`ana|${HERE}`]: { absenceTypeId: 7 } },
          { [`ana|${HERE}`]: { assignmentIds: [1] } },
        ),
      ).toEqual(["Ana Crawford's absence (Sick) was replaced with Day Shift · Supervisor"]);
    });

    it("is no longer mentored", () => {
      const days = { [`ana|${HERE}`]: { assignmentIds: [1] } };
      expect(describe1([gained("ana", 1, 0.5, 1)], days, days)).toEqual([
        "Ana Crawford is no longer mentored on Day Shift · Supervisor, counting 1",
      ]);
    });

    it("was scheduled", () => {
      expect(describe1([gained("ana")], {}, { [`ana|${HERE}`]: { assignmentIds: [1] } })).toEqual([
        "Ana Crawford was scheduled for Day Shift · Supervisor",
      ]);
    });
  });

  it("reads as taken off when the person keeps the rest of a double shift", () => {
    expect(
      describe1(
        [lost("ana")],
        { [`ana|${HERE}`]: { assignmentIds: [1, 2] } },
        { [`ana|${HERE}`]: { assignmentIds: [2] } },
      ),
    ).toEqual(["Ana Crawford was taken off Day Shift · Supervisor"]);
  });

  it("reads as scheduled when the shift is added beside work they keep", () => {
    expect(
      describe1(
        [gained("ana")],
        { [`ana|${HERE}`]: { assignmentIds: [4] } },
        { [`ana|${HERE}`]: { assignmentIds: [4, 1] } },
      ),
    ).toEqual(["Ana Crawford was scheduled for Day Shift · Supervisor"]);
  });

  it("names only the work that changed when some is kept", () => {
    expect(
      describe1(
        [lost("ana")],
        { [`ana|${HERE}`]: { assignmentIds: [1, 4] } },
        { [`ana|${HERE}`]: { assignmentIds: [4, 2] } },
      ),
    ).toEqual(["Ana Crawford's Day Shift · Supervisor changed to Evening Shift"]);
  });

  it("treats a rest-of-day absence beside a shift as work", () => {
    expect(
      describe1(
        [lost("ana")],
        { [`ana|${HERE}`]: { assignmentIds: [1] } },
        { [`ana|${HERE}`]: { assignmentIds: [2], absenceTypeId: 7 } },
      ),
    ).toEqual(["Ana Crawford's Day Shift · Supervisor changed to Evening Shift"]);
  });

  it("names the nearest date of a move, the earlier on a tie", () => {
    const published = { [`ana|${HERE}`]: { assignmentIds: [1] } };
    expect(
      describe1([lost("ana")], published, {
        "ana|2026-10-21": { assignmentIds: [1] },
        "ana|2026-10-24": { assignmentIds: [1] },
      }),
    ).toEqual(["Ana Crawford's Day Shift · Supervisor moved to Sat, Oct 24"]);
    expect(
      describe1([lost("ana")], published, {
        "ana|2026-10-22": { assignmentIds: [1] },
        "ana|2026-10-24": { assignmentIds: [1] },
      }),
    ).toEqual(["Ana Crawford's Day Shift · Supervisor moved to Thu, Oct 22"]);
  });

  it("ignores a date that already held the shift when published", () => {
    expect(
      describe1(
        [lost("ana")],
        { [`ana|${HERE}`]: { assignmentIds: [1] }, "ana|2026-10-24": { assignmentIds: [1] } },
        { "ana|2026-10-24": { assignmentIds: [1] } },
      ),
    ).toEqual(["Ana Crawford was taken off Day Shift · Supervisor"]);
  });

  it("lists losses first, then gains, each by name", () => {
    expect(
      describe1(
        [gained("ana"), lost("ben"), lost("zed")],
        { [`ben|${HERE}`]: { assignmentIds: [1] }, [`zed|${HERE}`]: { assignmentIds: [1] } },
        { [`ana|${HERE}`]: { assignmentIds: [1] } },
      ),
    ).toEqual([
      "Ben Shepherd was taken off Day Shift · Supervisor",
      "Someone was taken off Day Shift · Supervisor",
      "Ana Crawford was scheduled for Day Shift · Supervisor",
    ]);
  });

  it("still names archived work and absences", () => {
    expect(
      describe1(
        [lost("ana", 9)],
        { [`ana|${HERE}`]: { assignmentIds: [9] } },
        { [`ana|${HERE}`]: { absenceTypeId: 8 } },
      ),
    ).toEqual([
      "Ana Crawford was given an absence (Jury Duty (archived)) instead of Night Shift (archived)",
    ]);
  });
});

describe("coverageCellUnchangedText", () => {
  const cell = (overrides: Partial<CoverageMatrixCell>): CoverageMatrixCell => ({
    dateKey: HERE,
    draft: { actual: 1, required: 2, isMet: false, hasRequirement: true },
    published: { actual: 1, required: 2, isMet: false, hasRequirement: true },
    kind: "short",
    change: "none",
    past: false,
    shortage: 1,
    shortageDetails: [],
    preferredOpenAssignmentDefinitionId: 1,
    contributorChanges: [],
    ...overrides,
  });

  it("says when there is nothing to compare", () => {
    expect(coverageCellUnchangedText(cell({ published: null }))).toBe(
      "Not published yet, so there is nothing to compare.",
    );
  });

  it("says a short cell was already short", () => {
    expect(coverageCellUnchangedText(cell({}))).toBe(
      "Already short when published. Nothing in this draft changed it.",
    );
  });

  it("says nothing changed otherwise", () => {
    expect(coverageCellUnchangedText(cell({ kind: "staffed", shortage: 0 }))).toBe(
      "Nothing in this draft changed it.",
    );
  });
});

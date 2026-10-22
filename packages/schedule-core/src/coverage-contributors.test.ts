import { describe, expect, it } from "vitest";
import {
  buildAssignmentDefinitionIdsByFocusArea,
  computeCoverageCategorySnapshots,
  type CoverageAssignmentDefinitionLike,
  type CoverageCategorySnapshot,
  type CoverageRequirementLike,
} from "./coverage";
import { buildCoverageMatrix } from "./coverage-matrix";
import { formatLocalDateKey } from "./dates";

const MON = new Date(2026, 9, 26);
const TUE = new Date(2026, 9, 27);
const DATES = [MON, TUE];
const FOCUS_AREA = { id: 1, name: "Skilled Nursing" };
const ASSIGNMENTS: CoverageAssignmentDefinitionLike[] = [
  { id: 10, label: "D", sortOrder: 1, categoryId: 1, focusAreaId: 1 },
  { id: 20, label: "D-MA", sortOrder: 2, categoryId: 2, shiftId: 2, jobId: 5, focusAreaId: 1 },
  { id: 21, label: "D-CN", sortOrder: 3, categoryId: 2, shiftId: 2, jobId: 6, focusAreaId: 1 },
];
const LEGACY: CoverageRequirementLike = {
  focusAreaId: 1,
  assignmentId: 10,
  dayOfWeek: null,
  minStaff: 3,
};
const CURRENT: CoverageRequirementLike = {
  focusAreaId: 1,
  assignmentId: null,
  jobId: 5,
  preferredShiftId: 2,
  dayOfWeek: null,
  minStaff: 2,
};
const EMPLOYEES = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

/** `${employee}|${dateKey}` -> the codes worked, and mentored codes earning `credit`. */
type Week = Record<string, number[]>;

function snapshots(
  week: Week,
  mentored: ReadonlySet<string> = new Set(),
  credit = 0.5,
): CoverageCategorySnapshot[] {
  return computeCoverageCategorySnapshots({
    focusAreas: [FOCUS_AREA],
    shiftCategories: [
      { id: 1, name: "Day" },
      { id: 2, name: "Day Shift" },
    ],
    assignments: ASSIGNMENTS,
    requirements: [LEGACY, CURRENT],
    dates: DATES,
    employeesByFocusArea: new Map([[1, EMPLOYEES]]),
    assignmentIdsForKey: (empId, date) => week[`${empId}|${formatLocalDateKey(date)}`] ?? [],
    assignmentIdsByFocusArea: buildAssignmentDefinitionIdsByFocusArea([FOCUS_AREA], ASSIGNMENTS),
    coverageCreditForKey: (empId, date, assignmentId) =>
      mentored.has(`${empId}|${formatLocalDateKey(date)}|${assignmentId}`) ? credit : 1,
    includeContributors: true,
  });
}

function matrixOf(draft: CoverageCategorySnapshot[], published: CoverageCategorySnapshot[]) {
  return buildCoverageMatrix({
    draft,
    published,
    dates: DATES,
    publishedDateKeys: new Set(DATES.map(formatLocalDateKey)),
    isStarted: () => false,
  });
}

function cell(matrix: ReturnType<typeof matrixOf>, rowKey: string, date: Date) {
  const row = matrix.rows.find((candidate) => candidate.rowKey === rowKey);
  return row?.cells[matrix.dateKeys.indexOf(formatLocalDateKey(date))] ?? null;
}

const LEGACY_ROW = "1:1";
const CURRENT_ROW = "1:5:2";

describe("coverage contributors", () => {
  it("lists exactly who each snapshot counts, for both requirement models", () => {
    const result = snapshots(
      { "a|2026-10-26": [10], "b|2026-10-26": [10, 20], "c|2026-10-26": [20] },
      new Set(["b|2026-10-26|20"]),
    );

    for (const snapshot of result) {
      const total = (snapshot.contributors ?? []).reduce((sum, entry) => sum + entry.credit, 0);
      expect(total).toBeCloseTo(snapshot.status.actual, 9);
    }
    const legacy = result.find((s) => s.rowKey === LEGACY_ROW && s.date === MON);
    expect(legacy?.contributors).toEqual([
      { employeeId: "a", assignmentId: 10, credit: 1 },
      { employeeId: "b", assignmentId: 10, credit: 1 },
    ]);
    const current = result.find((s) => s.rowKey === CURRENT_ROW && s.date === MON);
    expect(current?.contributors).toEqual([
      { employeeId: "b", assignmentId: 20, credit: 0.5 },
      { employeeId: "c", assignmentId: 20, credit: 1 },
    ]);
  });

  it("carries no contributors unless asked", () => {
    const result = computeCoverageCategorySnapshots({
      focusAreas: [FOCUS_AREA],
      shiftCategories: [{ id: 1, name: "Day" }],
      assignments: ASSIGNMENTS,
      requirements: [LEGACY],
      dates: [MON],
      employeesByFocusArea: new Map([[1, EMPLOYEES]]),
      assignmentIdsForKey: () => [10],
      assignmentIdsByFocusArea: buildAssignmentDefinitionIdsByFocusArea([FOCUS_AREA], ASSIGNMENTS),
    });
    expect(result[0]).not.toHaveProperty("contributors");
  });

  it("names a removed and an added person", () => {
    const matrix = matrixOf(
      snapshots({ "a|2026-10-26": [10], "c|2026-10-26": [10] }),
      snapshots({ "a|2026-10-26": [10], "b|2026-10-26": [10] }),
    );

    expect(cell(matrix, LEGACY_ROW, MON)?.contributorChanges).toEqual([
      {
        employeeId: "b",
        publishedAssignmentId: 10,
        draftAssignmentId: null,
        publishedCredit: 1,
        draftCredit: 0,
      },
      {
        employeeId: "c",
        publishedAssignmentId: null,
        draftAssignmentId: 10,
        publishedCredit: 0,
        draftCredit: 1,
      },
    ]);
    expect(cell(matrix, LEGACY_ROW, MON)?.change).toBe("none");
  });

  it("names a mentoring-only change", () => {
    const week = { "a|2026-10-26": [20] };
    const matrix = matrixOf(snapshots(week, new Set(["a|2026-10-26|20"])), snapshots(week));

    expect(cell(matrix, CURRENT_ROW, MON)?.contributorChanges).toEqual([
      {
        employeeId: "a",
        publishedAssignmentId: 20,
        draftAssignmentId: 20,
        publishedCredit: 1,
        draftCredit: 0.5,
      },
    ]);
  });

  it("lists nothing on a date never published", () => {
    const matrix = buildCoverageMatrix({
      draft: snapshots({ "a|2026-10-26": [10] }),
      published: snapshots({}),
      dates: DATES,
      publishedDateKeys: new Set(),
      isStarted: () => false,
    });

    expect(cell(matrix, LEGACY_ROW, MON)?.contributorChanges).toEqual([]);
  });

  it("always adds up to the cell's change", () => {
    let seed = 47;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const codes = [[], [10], [20], [21], [10, 20], [20, 21]];
    const randomWeek = (): { week: Week; mentored: Set<string> } => {
      const week: Week = {};
      const mentored = new Set<string>();
      for (const { id } of EMPLOYEES) {
        for (const date of DATES) {
          const key = `${id}|${formatLocalDateKey(date)}`;
          week[key] = codes[Math.floor(random() * codes.length)];
          for (const code of week[key]) if (random() < 0.3) mentored.add(`${key}|${code}`);
        }
      }
      return { week, mentored };
    };

    for (let round = 0; round < 200; round++) {
      const draft = randomWeek();
      const published = randomWeek();
      const credit = [0.3, 0.5, 0.7][round % 3];
      const matrix = matrixOf(
        snapshots(draft.week, draft.mentored, credit),
        snapshots(published.week, published.mentored, credit),
      );
      for (const row of matrix.rows) {
        for (const entry of row.cells) {
          if (!entry?.published) continue;
          const delta = entry.contributorChanges.reduce(
            (sum, change) => sum + change.draftCredit - change.publishedCredit,
            0,
          );
          expect(delta).toBeCloseTo(entry.draft.actual - entry.published.actual, 9);
        }
      }
    }
  });
});

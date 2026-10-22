import { describe, expect, it } from "vitest";
import type { CoverageCategorySnapshot } from "./coverage";
import { buildCoverageMatrix, summarizeCoverageMatrixRows } from "./coverage-matrix";

const MON = new Date(2026, 9, 26);
const TUE = new Date(2026, 9, 27);
const WED = new Date(2026, 9, 28);

function snapshot(
  date: Date,
  actual: number,
  required: number,
  overrides: Partial<CoverageCategorySnapshot> = {},
): CoverageCategorySnapshot {
  return {
    focusAreaId: 1,
    focusAreaName: "Skilled Nursing",
    rowKey: "1:5:1",
    rowLabel: "Day Shift · Med Aide",
    shiftCategoryId: 1,
    shiftCategoryName: "Day Shift",
    date,
    status: { actual, required, isMet: actual >= required, hasRequirement: required > 0 },
    eligibleAssignmentDefinitionIds: [20],
    preferredOpenAssignmentDefinitionId: 20,
    shortageDetails: [],
    ...overrides,
  };
}

const allPublished = new Set(["2026-10-26", "2026-10-27", "2026-10-28"]);
const notStarted = () => false;

describe("buildCoverageMatrix", () => {
  it("classifies short, over and staffed cells", () => {
    const draft = [snapshot(MON, 1, 3), snapshot(TUE, 4, 3), snapshot(WED, 3, 3)];
    const matrix = buildCoverageMatrix({
      draft,
      published: draft,
      dates: [MON, TUE, WED],
      publishedDateKeys: allPublished,
      isStarted: notStarted,
    });

    expect(matrix.dateKeys).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].cells.map((cell) => cell?.kind)).toEqual(["short", "over", "staffed"]);
    expect(matrix.rows[0].cells[0]?.shortage).toBe(2);
    expect(matrix.totals).toMatchObject({ short: 1, over: 1, opened: 0, closed: 0 });
  });

  it("marks what the draft opened, closed and otherwise changed against published", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 2, 3), snapshot(TUE, 3, 3), snapshot(WED, 5, 3)],
      published: [snapshot(MON, 3, 3), snapshot(TUE, 1, 3), snapshot(WED, 4, 3)],
      dates: [MON, TUE, WED],
      publishedDateKeys: allPublished,
      isStarted: notStarted,
    });

    expect(matrix.rows[0].cells.map((cell) => cell?.change)).toEqual([
      "opened",
      "closed",
      "changed",
    ]);
    expect(matrix.rows[0].cells[1]?.published?.actual).toBe(1);
    expect(matrix.totals).toMatchObject({ opened: 1, closed: 1, changed: 1, short: 1, over: 1 });
  });

  it("has no Before and no change mark on a date never published", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 1, 3)],
      published: [snapshot(MON, 3, 3)],
      dates: [MON],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    const cell = matrix.rows[0].cells[0];
    expect(cell?.published).toBeNull();
    expect(cell?.change).toBe("none");
    expect(matrix.totals).toMatchObject({ short: 1, opened: 0 });
  });

  it("shows a started cell but counts nothing for it", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 1, 3), snapshot(TUE, 1, 3)],
      published: [snapshot(MON, 3, 3), snapshot(TUE, 1, 3)],
      dates: [MON, TUE],
      publishedDateKeys: allPublished,
      isStarted: (s) => s.date === MON,
    });

    expect(matrix.rows[0].cells[0]).toMatchObject({ past: true, kind: "short", change: "opened" });
    expect(matrix.totals).toEqual({
      short: 1,
      over: 0,
      opened: 0,
      closed: 0,
      changed: 0,
      staffShortByDate: { "2026-10-26": 0, "2026-10-27": 2 },
    });
  });

  it("keeps fractional mentored credit exact, per cell and per day", () => {
    const matrix = buildCoverageMatrix({
      draft: [
        snapshot(MON, 2.5, 3),
        snapshot(MON, 0.5, 1, { rowKey: "1:6:1", rowLabel: "Day Shift · Charge Nurse" }),
      ],
      published: [],
      dates: [MON],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    expect(matrix.rows.map((row) => row.cells[0]?.shortage)).toEqual([0.5, 0.5]);
    expect(matrix.totals.short).toBe(2);
    expect(matrix.totals.staffShortByDate["2026-10-26"]).toBe(1);
  });

  it("treats float noise in mentored credit as staffed", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 0.1 + 0.2, 0.3)],
      published: [],
      dates: [MON],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    expect(matrix.rows[0].cells[0]?.kind).toBe("staffed");
  });

  it("leaves a day empty when the requirement asks for nobody that day", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 1, 1), snapshot(WED, 1, 1)],
      published: [],
      dates: [MON, TUE, WED],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    expect(matrix.rows[0].cells.map((cell) => cell === null)).toEqual([false, true, false]);
  });

  it("keeps a published week and an unpublished week apart", () => {
    const matrix = buildCoverageMatrix({
      draft: [snapshot(MON, 1, 3), snapshot(TUE, 1, 3)],
      published: [snapshot(MON, 3, 3), snapshot(TUE, 3, 3)],
      dates: [MON, TUE],
      publishedDateKeys: new Set(["2026-10-26"]),
      isStarted: notStarted,
    });

    expect(matrix.rows[0].cells.map((cell) => cell?.change)).toEqual(["opened", "none"]);
    expect(matrix.totals.opened).toBe(1);
  });

  it("orders rows by first appearance and ignores dates outside the window", () => {
    const matrix = buildCoverageMatrix({
      draft: [
        snapshot(MON, 1, 1, { rowKey: "2:1", rowLabel: "Evening", focusAreaId: 2 }),
        snapshot(MON, 1, 1),
        snapshot(new Date(2026, 10, 30), 0, 1),
      ],
      published: [],
      dates: [MON],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    expect(matrix.rows.map((row) => row.rowKey)).toEqual(["2:1", "1:5:1"]);
    expect(matrix.totals.short).toBe(0);
  });

  it("is empty for empty input", () => {
    const matrix = buildCoverageMatrix({
      draft: [],
      published: [],
      dates: [],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    expect(matrix).toEqual({
      dateKeys: [],
      rows: [],
      totals: { short: 0, over: 0, opened: 0, closed: 0, changed: 0, staffShortByDate: {} },
    });
  });

  it("totals one focus area's rows on their own", () => {
    const matrix = buildCoverageMatrix({
      draft: [
        snapshot(MON, 1, 3),
        snapshot(MON, 2, 1, { rowKey: "2:5:1", focusAreaId: 2, focusAreaName: "Sheltered Care" }),
      ],
      published: [],
      dates: [MON],
      publishedDateKeys: new Set(),
      isStarted: notStarted,
    });

    const sheltered = matrix.rows.filter((row) => row.focusAreaId === 2);
    expect(summarizeCoverageMatrixRows(sheltered, matrix.dateKeys)).toEqual({
      short: 0,
      over: 1,
      opened: 0,
      closed: 0,
      changed: 0,
      staffShortByDate: { "2026-10-26": 0 },
    });
    expect(matrix.totals).toMatchObject({ short: 1, over: 1 });
  });
});

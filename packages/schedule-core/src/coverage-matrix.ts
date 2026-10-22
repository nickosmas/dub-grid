import type { CoverageCategorySnapshot, CoverageShortageDetail, CoverageStatus } from "./coverage";
import { formatLocalDateKey } from "./dates";

export type CoverageCellKind = "short" | "over" | "staffed";

/**
 * How the draft compares with what staff see now: `opened` when the draft is
 * short where the published schedule was not, `closed` the reverse, `changed`
 * for any other difference in the counts, `none` when they match or the date
 * is not published yet.
 */
export type CoverageCellChange = "opened" | "closed" | "changed" | "none";

export interface CoverageMatrixCell {
  dateKey: string;
  draft: CoverageStatus;
  /** Null on a date that has never been published. */
  published: CoverageStatus | null;
  kind: CoverageCellKind;
  change: CoverageCellChange;
  /** The shift has begun (or the day has passed); shown, never counted. */
  past: boolean;
  /** Required minus actual when short, else 0. Fractional with mentored credit. */
  shortage: number;
  shortageDetails: CoverageShortageDetail[];
  preferredOpenAssignmentDefinitionId: number;
}

export interface CoverageMatrixRow {
  focusAreaId: number;
  focusAreaName: string;
  rowKey: string;
  rowLabel: string;
  /** One entry per requested date, in order; null where the requirement asks for nobody that day. */
  cells: (CoverageMatrixCell | null)[];
}

export interface CoverageMatrixTotals {
  short: number;
  over: number;
  opened: number;
  closed: number;
  /** Cells whose counts differ from published without opening or closing a gap. */
  changed: number;
  /** Summed shortage per date key, counting only cells that have not started. */
  staffShortByDate: Record<string, number>;
}

export interface CoverageMatrix {
  dateKeys: string[];
  rows: CoverageMatrixRow[];
  totals: CoverageMatrixTotals;
}

export interface BuildCoverageMatrixInput {
  draft: ReadonlyArray<CoverageCategorySnapshot>;
  published: ReadonlyArray<CoverageCategorySnapshot>;
  dates: ReadonlyArray<Date>;
  /** Date keys that have been published at least once. */
  publishedDateKeys: ReadonlySet<string>;
  /** True when the snapshot's shift has already started. */
  isStarted: (snapshot: CoverageCategorySnapshot) => boolean;
}

// Mentored credit makes counts fractional, so equality allows float noise.
const EPSILON = 1e-9;

function kindOf(status: CoverageStatus): CoverageCellKind {
  if (status.actual < status.required - EPSILON) return "short";
  if (status.actual > status.required + EPSILON) return "over";
  return "staffed";
}

function changeOf(draft: CoverageStatus, published: CoverageStatus | null): CoverageCellChange {
  if (!published) return "none";
  const draftShort = kindOf(draft) === "short";
  const publishedShort = kindOf(published) === "short";
  if (draftShort && !publishedShort) return "opened";
  if (!draftShort && publishedShort) return "closed";
  if (
    Math.abs(draft.actual - published.actual) > EPSILON ||
    Math.abs(draft.required - published.required) > EPSILON
  ) {
    return "changed";
  }
  return "none";
}

/**
 * Lays draft coverage beside published coverage, one row per requirement and
 * one column per date. Both inputs come from `computeCoverageCategorySnapshots`
 * over the same requirements; this only compares them.
 */
export function buildCoverageMatrix(input: BuildCoverageMatrixInput): CoverageMatrix {
  const dateKeys = input.dates.map(formatLocalDateKey);
  const columnByDateKey = new Map(dateKeys.map((key, index) => [key, index]));
  const publishedByCell = new Map(
    input.published.map((snapshot) => [
      `${snapshot.rowKey}|${formatLocalDateKey(snapshot.date)}`,
      snapshot,
    ]),
  );

  const rowsByKey = new Map<string, CoverageMatrixRow>();

  for (const snapshot of input.draft) {
    const dateKey = formatLocalDateKey(snapshot.date);
    const column = columnByDateKey.get(dateKey);
    if (column === undefined) continue;

    let row = rowsByKey.get(snapshot.rowKey);
    if (!row) {
      row = {
        focusAreaId: snapshot.focusAreaId,
        focusAreaName: snapshot.focusAreaName,
        rowKey: snapshot.rowKey,
        rowLabel: snapshot.rowLabel,
        cells: dateKeys.map(() => null),
      };
      rowsByKey.set(snapshot.rowKey, row);
    }

    const publishedSnapshot = input.publishedDateKeys.has(dateKey)
      ? publishedByCell.get(`${snapshot.rowKey}|${dateKey}`)
      : undefined;
    const published = publishedSnapshot?.status ?? null;
    const kind = kindOf(snapshot.status);
    const change = changeOf(snapshot.status, published);
    const past = input.isStarted(snapshot);
    const shortage =
      kind === "short"
        ? Math.round((snapshot.status.required - snapshot.status.actual) * 1e6) / 1e6
        : 0;

    row.cells[column] = {
      dateKey,
      draft: snapshot.status,
      published,
      kind,
      change,
      past,
      shortage,
      shortageDetails: snapshot.shortageDetails,
      preferredOpenAssignmentDefinitionId: snapshot.preferredOpenAssignmentDefinitionId,
    };
  }

  const rows = Array.from(rowsByKey.values());
  return { dateKeys, rows, totals: summarizeCoverageMatrixRows(rows, dateKeys) };
}

/** Totals for a set of rows (all of them, or one focus area's), skipping started cells. */
export function summarizeCoverageMatrixRows(
  rows: ReadonlyArray<CoverageMatrixRow>,
  dateKeys: ReadonlyArray<string>,
): CoverageMatrixTotals {
  const totals: CoverageMatrixTotals = {
    short: 0,
    over: 0,
    opened: 0,
    closed: 0,
    changed: 0,
    staffShortByDate: Object.fromEntries(dateKeys.map((key) => [key, 0])),
  };
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!cell || cell.past) continue;
      if (cell.kind === "short") {
        totals.short += 1;
        totals.staffShortByDate[cell.dateKey] =
          Math.round((totals.staffShortByDate[cell.dateKey] + cell.shortage) * 1e6) / 1e6;
      }
      if (cell.kind === "over") totals.over += 1;
      if (cell.change === "opened") totals.opened += 1;
      if (cell.change === "closed") totals.closed += 1;
      if (cell.change === "changed") totals.changed += 1;
    }
  }
  return totals;
}

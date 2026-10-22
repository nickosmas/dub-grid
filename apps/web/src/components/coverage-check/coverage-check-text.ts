import type { CoverageMatrixCell, CoverageMatrixTotals } from "@dubgrid/schedule-core";

export type CoverageCheckView = "all" | "changes";

/** Mentored credit is a whole percentage, so two decimals are always exact. */
export function formatCoverageNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCoverageNumber(count)} ${count === 1 ? singular : plural}`;
}

export function formatCellCount(actual: number, required: number): string {
  return `${formatCoverageNumber(actual)}/${formatCoverageNumber(required)}`;
}

export function describeCellState(cell: CoverageMatrixCell): string {
  const { actual, required } = cell.draft;
  if (cell.kind === "short") return `Short ${formatCoverageNumber(cell.shortage)}`;
  if (cell.kind === "over") return `Over by ${formatCoverageNumber(actual - required)}`;
  return "Staffed";
}

/** Change marks only apply to cells that are still ahead; a started cell is history. */
export function visibleChange(cell: CoverageMatrixCell): CoverageMatrixCell["change"] {
  return cell.past ? "none" : cell.change;
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function cellAccessibleName(args: {
  cell: CoverageMatrixCell;
  focusAreaName: string;
  rowLabel: string;
  date: Date;
}): string {
  const { cell } = args;
  const parts = [
    `${args.focusAreaName}, ${args.rowLabel}, ${formatLongDate(args.date)}: ${formatCoverageNumber(
      cell.draft.actual,
    )} of ${formatCoverageNumber(cell.draft.required)} staffed, ${describeCellState(
      cell,
    ).toLowerCase()}`,
  ];
  if (cell.published && visibleChange(cell) !== "none") {
    parts.push(
      `published ${formatCoverageNumber(cell.published.actual)} of ${formatCoverageNumber(
        cell.published.required,
      )}`,
    );
  }
  if (cell.past) parts.push("already started, not counted");
  return parts.join(", ");
}

export function coverageCheckSubtitle(args: {
  totals: CoverageMatrixTotals;
  publishedOnly: boolean;
  areaName: string | null;
}): string {
  const { short, over } = args.totals;
  const scope = args.areaName ? ` in ${args.areaName}` : "";
  if (short === 0 && over === 0) {
    if (args.publishedOnly) return `No gaps on published dates${scope}`;
    return args.areaName ? `All requirements met${scope}` : "All requirements met";
  }
  return `${pluralize(short, "shift")} short · ${formatCoverageNumber(over)} over${scope}${
    args.publishedOnly ? " on published dates" : ""
  }`;
}

/**
 * What the draft does to coverage compared with what staff see now. Only
 * cells that are still ahead and on published dates are compared.
 */
export function comparisonSentence(totals: CoverageMatrixTotals, partial: boolean): string {
  const where = partial ? " on published dates" : "";
  const { opened, closed, changed } = totals;
  if (opened === 0 && closed === 0 && changed === 0) {
    return `This draft matches the published schedule${where}.`;
  }
  if (opened === 0 && closed === 0) {
    return `Compared with the published schedule, this draft opens and closes no gaps, and changes the count in ${pluralize(changed, "cell")}${where}.`;
  }
  const opens = opened === 0 ? "opens no gaps" : `opens ${pluralize(opened, "gap")}`;
  const closes = closed === 0 ? "closes none" : `closes ${formatCoverageNumber(closed)}`;
  const other =
    changed === 0 ? "" : `, and changes the count in ${pluralize(changed, "other cell")}`;
  return `Compared with the published schedule, this draft ${opens} and ${closes}${other}${where}.`;
}

export function requirementSummary(cells: ReadonlyArray<CoverageMatrixCell | null>): string {
  const required = [...new Set(cells.flatMap((cell) => (cell ? [cell.draft.required] : [])))].sort(
    (a, b) => a - b,
  );
  if (required.length === 0) return "";
  if (required.length === 1) return `needs ${formatCoverageNumber(required[0])}`;
  return `needs ${formatCoverageNumber(required[0])} to ${formatCoverageNumber(
    required[required.length - 1],
  )}`;
}

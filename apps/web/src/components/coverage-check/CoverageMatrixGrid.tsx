"use client";

import type { CSSProperties } from "react";
import type { CoverageMatrixCell, CoverageMatrixRow } from "@dubgrid/schedule-core";
import {
  cellAccessibleName,
  formatCellCount,
  formatCoverageNumber,
  formatLongDate,
  requirementSummary,
  visibleChange,
  type CoverageCheckView,
} from "./coverage-check-text";

export interface CoverageCellRef {
  rowKey: string;
  dateKey: string;
}

interface CoverageMatrixGridProps {
  dates: Date[];
  dateKeys: string[];
  rows: CoverageMatrixRow[];
  staffShortByDate: Record<string, number>;
  publishedDateKeys: ReadonlySet<string>;
  showUnpublishedMarks: boolean;
  view: CoverageCheckView;
  todayKey: string;
  selected: CoverageCellRef | null;
  onSelect: (cell: CoverageCellRef) => void;
}

function cellClassName(cell: CoverageMatrixCell, view: CoverageCheckView, selected: boolean) {
  const change = view === "changes" ? visibleChange(cell) : "none";
  const classes = ["dg-cc-cell", "dg-tabular-nums"];
  classes.push(change === "closed" ? "dg-cc-cell--closed" : `dg-cc-cell--${cell.kind}`);
  if (change === "opened") classes.push("dg-cc-cell--opened");
  if (change === "changed") classes.push("dg-cc-cell--changed");
  if (cell.past) classes.push("dg-cc-cell--past");
  if (selected) classes.push("dg-cc-cell--selected");
  return classes.join(" ");
}

function groupRows(rows: CoverageMatrixRow[]) {
  const groups: { focusAreaId: number; focusAreaName: string; rows: CoverageMatrixRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.focusAreaId === row.focusAreaId) last.rows.push(row);
    else
      groups.push({ focusAreaId: row.focusAreaId, focusAreaName: row.focusAreaName, rows: [row] });
  }
  return groups;
}

export function CoverageMatrixGrid({
  dates,
  dateKeys,
  rows,
  staffShortByDate,
  publishedDateKeys,
  showUnpublishedMarks,
  view,
  todayKey,
  selected,
  onSelect,
}: CoverageMatrixGridProps) {
  const gridStyle = { "--dg-cc-days": dates.length } as CSSProperties;
  const weekBreak = (index: number) => (index > 0 && index % 7 === 0 ? " dg-cc-week-start" : "");

  return (
    <div className="dg-cc-scroll" role="region" aria-label="Coverage by day" tabIndex={0}>
      <div className="dg-cc-matrix" style={gridStyle}>
        <div className="dg-cc-row dg-cc-row--head">
          <div className="dg-cc-label dg-cc-caption">Staffed / needed</div>
          {dates.map((date, index) => {
            const key = dateKeys[index];
            const unpublished = showUnpublishedMarks && !publishedDateKeys.has(key);
            const classes = ["dg-cc-day"];
            if (key === todayKey) classes.push("dg-cc-day--today");
            if (key < todayKey) classes.push("dg-cc-day--past");
            if (unpublished) classes.push("dg-cc-day--unpublished");
            if (selected?.dateKey === key) classes.push("dg-cc-day--selected");
            return (
              <div key={key} className={classes.join(" ") + weekBreak(index)}>
                <span aria-hidden>
                  {date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
                </span>
                <b aria-hidden className="dg-tabular-nums">
                  {date.getDate()}
                </b>
                <span className="sr-only">
                  {formatLongDate(date)}
                  {key === todayKey ? ", today" : ""}
                  {unpublished ? ", not published yet" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="dg-cc-row dg-cc-row--short">
          <div className="dg-cc-label dg-cc-short-label">Staff short</div>
          {dateKeys.map((key, index) => {
            const short = staffShortByDate[key] ?? 0;
            return (
              <div key={key} className={`dg-cc-short dg-tabular-nums${weekBreak(index)}`}>
                {short > 0 ? (
                  <>
                    <span aria-hidden>{formatCoverageNumber(short)}</span>
                    <span className="sr-only">
                      {formatLongDate(dates[index])}: {formatCoverageNumber(short)} staff short
                    </span>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        {groupRows(rows).map((group) => (
          <div key={group.focusAreaId} className="dg-cc-group">
            <div className="dg-cc-group-name">{group.focusAreaName}</div>
            {group.rows.map((row) => (
              <div key={row.rowKey} className="dg-cc-row">
                <div
                  className={`dg-cc-label${selected?.rowKey === row.rowKey ? " dg-cc-label--selected" : ""}`}
                >
                  <div className="dg-cc-row-name">{row.rowLabel}</div>
                  <div className="dg-cc-row-need dg-tabular-nums">
                    {requirementSummary(row.cells)}
                  </div>
                </div>
                {row.cells.map((cell, index) => {
                  const key = dateKeys[index];
                  if (!cell) {
                    return (
                      <div key={key} className={`dg-cc-cell dg-cc-cell--none${weekBreak(index)}`} />
                    );
                  }
                  const isSelected =
                    selected?.rowKey === row.rowKey && selected.dateKey === cell.dateKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={cellClassName(cell, view, isSelected) + weekBreak(index)}
                      aria-pressed={isSelected}
                      aria-label={cellAccessibleName({
                        cell,
                        focusAreaName: row.focusAreaName,
                        rowLabel: row.rowLabel,
                        date: dates[index],
                      })}
                      onClick={() => onSelect({ rowKey: row.rowKey, dateKey: cell.dateKey })}
                    >
                      {formatCellCount(cell.draft.actual, cell.draft.required)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import {
  coverageCellUnchangedText,
  type CoverageMatrixCell,
  type CoverageMatrixRow,
} from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { CoverageSuggestionRow, type CoverageSuggestionView } from "./CoverageSuggestions";
import {
  describeCellState,
  formatCellCount,
  formatCoverageNumber,
  formatShortDate,
  pluralize,
} from "./coverage-check-text";

/** What the schedule page can do for a short cell right now. */
export interface CoverageCellFill {
  /** An open shift exists for this gap, so the staffing dialog can fill it. */
  canFill: boolean;
  /** Pickup requests waiting for approval on this gap. */
  pendingPickups: number;
}

interface CoverageCellDetailProps {
  row: CoverageMatrixRow;
  cell: CoverageMatrixCell;
  date: Date;
  canEditShifts: boolean;
  fill: CoverageCellFill;
  /** One line per draft change behind the cell; editors only. */
  changes: string[];
  /** Suggestions that fix this cell; editors only. */
  ways: CoverageSuggestionView[];
  /** Why each other qualified person was not suggested; editors only. */
  notSuggested: string[];
  busy: boolean;
  onApply: (suggestion: CoverageSuggestionView["suggestion"]) => void;
  onFillSpot: () => void;
  onShowInGrid: () => void;
}

export function stillNeededText(cell: CoverageMatrixCell): string {
  const details = cell.shortageDetails.filter((detail) => detail.shortage > 0);
  if (details.length === 0) return `${pluralize(cell.shortage, "person", "people")} more`;
  return details
    .map((detail) => `${detail.assignmentFullName} (${formatCoverageNumber(detail.shortage)})`)
    .join(", ");
}

export function pendingPickupText(count: number): string {
  return count === 1
    ? "1 pickup request is waiting for this shift."
    : `${formatCoverageNumber(count)} pickup requests are waiting for this shift.`;
}

export function CoverageCellDetail({
  row,
  cell,
  date,
  canEditShifts,
  fill,
  changes,
  ways,
  notSuggested,
  busy,
  onApply,
  onFillSpot,
  onShowInGrid,
}: CoverageCellDetailProps) {
  const isActionable = canEditShifts && cell.kind === "short" && !cell.past;
  const showFill = isActionable && fill.canFill;
  const badgeClass =
    cell.kind === "short"
      ? "dg-cc-cell--short"
      : cell.kind === "over"
        ? "dg-cc-cell--over"
        : "dg-cc-cell--closed";

  return (
    <section className="dg-cc-detail" aria-label="Selected day">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="dg-cc-detail-title">
            {row.focusAreaName} · {row.rowLabel}
          </h3>
          <div className="dg-cc-detail-date dg-tabular-nums">
            {formatShortDate(date)}
            {cell.past ? " · already started" : ""}
          </div>
        </div>
        <span className={`dg-cc-badge dg-tabular-nums ${badgeClass}`}>
          {describeCellState(cell)}
        </span>
      </div>

      {canEditShifts ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="dg-cc-side">
            <div className="dg-cc-caption">Before</div>
            <div className="dg-cc-side-value dg-tabular-nums">
              {cell.published
                ? formatCellCount(cell.published.actual, cell.published.required)
                : "Not published yet"}
            </div>
            <div className="dg-cc-side-note">Published</div>
          </div>
          <div className="dg-cc-side">
            <div className="dg-cc-caption">After</div>
            <div className="dg-cc-side-value dg-tabular-nums">
              {formatCellCount(cell.draft.actual, cell.draft.required)}
            </div>
            <div className="dg-cc-side-note">This draft</div>
          </div>
        </div>
      ) : (
        <div className="dg-cc-side">
          <div className="dg-cc-caption">Staffed / needed</div>
          <div className="dg-cc-side-value dg-tabular-nums">
            {formatCellCount(cell.draft.actual, cell.draft.required)}
          </div>
          <div className="dg-cc-side-note">Published</div>
        </div>
      )}

      {cell.kind === "short" && (
        <p className="dg-cc-detail-line dg-tabular-nums">
          <span className="font-semibold">Still needed:</span> {stillNeededText(cell)}
        </p>
      )}
      {canEditShifts &&
        (changes.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="dg-cc-caption">What changed</div>
            <ul className="dg-cc-changes">
              {changes.map((line) => (
                <li key={line} className="dg-cc-change dg-cc-detail-line dg-tabular-nums">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="dg-cc-detail-line dg-cc-detail-line--muted">
            {coverageCellUnchangedText(cell)}
          </p>
        ))}
      {canEditShifts && ways.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="dg-cc-caption">Ways to fix</div>
          <ul className="dg-cc-sg-list">
            {ways.map((view) => (
              <CoverageSuggestionRow
                key={view.suggestion.id}
                view={view}
                busy={busy}
                onApply={onApply}
              />
            ))}
          </ul>
        </div>
      )}
      {canEditShifts && notSuggested.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="dg-cc-caption">Not suggested</div>
          <ul className="dg-cc-changes">
            {notSuggested.map((line) => (
              <li key={line} className="dg-cc-change dg-cc-detail-line dg-cc-detail-line--muted">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isActionable && fill.pendingPickups > 0 && (
        <p className="dg-cc-detail-line dg-tabular-nums">
          {pendingPickupText(fill.pendingPickups)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {showFill && (
          <Button type="button" className="dg-btn dg-btn-primary" onClick={onFillSpot}>
            Fill a spot
          </Button>
        )}
        <Button
          type="button"
          className={`dg-btn dg-btn-secondary${showFill ? "" : " col-span-2"}`}
          onClick={onShowInGrid}
        >
          Show in grid
        </Button>
      </div>
    </section>
  );
}

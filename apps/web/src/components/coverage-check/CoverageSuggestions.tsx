"use client";

import { Check } from "lucide-react";
import type {
  CoverageSuggestion,
  CoverageSuggestionKind,
  CoverageSuggestionText,
} from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import { formatCoverageNumber, formatLongDate } from "./coverage-check-text";

export interface CoverageSuggestionView {
  suggestion: CoverageSuggestion;
  text: CoverageSuggestionText;
}

/** A suggestion that was applied in this visit, with what Undo needs. */
export interface AppliedCoverageSuggestion {
  id: string;
  text: string;
  /** An approval is published and cannot be undone here. */
  final: boolean;
}

const ACTION_LABELS: Record<CoverageSuggestionKind, string | null> = {
  moveBack: "Move back",
  restore: "Restore",
  assign: "Schedule",
  approvePickup: "Approve",
  pattern: null,
};

const PAST_TENSE: Record<string, string> = {
  Move: "Moved",
  Change: "Changed",
  Restore: "Restored",
  Schedule: "Scheduled",
  Approve: "Approved",
};

/** "Move Ana's Day Shift back" reads "Moved Ana's Day Shift back" once done. */
export function appliedSuggestionText(title: string): string {
  const [verb, ...rest] = title.split(" ");
  return [PAST_TENSE[verb] ?? verb, ...rest].join(" ");
}

export function suggestionActionLabel(kind: CoverageSuggestionKind): string | null {
  return ACTION_LABELS[kind];
}

interface SuggestionRowProps {
  view: CoverageSuggestionView;
  busy: boolean;
  onApply: (suggestion: CoverageSuggestion) => void;
}

export function CoverageSuggestionRow({ view, busy, onApply }: SuggestionRowProps) {
  const { suggestion, text } = view;
  const action = suggestionActionLabel(suggestion.kind);
  return (
    <li className="dg-cc-sg">
      <div className="dg-cc-sg-main">
        <span className="dg-cc-sg-title">{text.title}</span>
        <span className="dg-cc-sg-detail">{text.detail}</span>
        {text.effect && <span className="dg-cc-sg-effect dg-tabular-nums">{text.effect}</span>}
        {text.changes.length > 0 && (
          <ul className="dg-cc-sg-changes" aria-label="What it changes">
            {text.changes.map((line) => (
              <li key={line} className="dg-tabular-nums">
                {line}
              </li>
            ))}
          </ul>
        )}
        {text.outcome && <span className="dg-cc-sg-outcome">{text.outcome}</span>}
      </div>
      {action && (
        <Button
          type="button"
          className="dg-btn dg-btn-primary dg-btn-sm dg-cc-sg-action"
          onClick={() => onApply(suggestion)}
          disabled={busy}
          aria-label={`${action}: ${text.title}`}
        >
          {action}
        </Button>
      )}
    </li>
  );
}

interface CoverageAppliedListProps {
  applied: AppliedCoverageSuggestion[];
  busy: boolean;
  onUndo: (appliedId: string) => void;
}

/** What was applied in this visit, kept in view so Undo is always reachable. */
export function CoverageAppliedList({ applied, busy, onUndo }: CoverageAppliedListProps) {
  if (applied.length === 0) return null;
  return (
    <section className="dg-cc-suggestions" aria-label="Applied">
      <div className="dg-cc-caption">Applied</div>
      <ul className="dg-cc-sg-list">
        {applied.map((entry) => (
          <li key={entry.id} className="dg-cc-applied">
            <Check size={16} aria-hidden className="dg-cc-applied-icon" />
            <span className="dg-cc-detail-line">{entry.text}</span>
            {entry.final ? (
              <span className="dg-cc-applied-final">Published</span>
            ) : (
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => onUndo(entry.id)}
                disabled={busy}
                aria-label={`Undo: ${entry.text}`}
              >
                Undo
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CoverageDayDetailProps {
  date: Date;
  staffShort: number;
  items: CoverageSuggestionView[];
  busy: boolean;
  onApply: (suggestion: CoverageSuggestion) => void;
  /** Applies every draft fix for this day; omitted when there is none. */
  onApplyAll?: () => void;
}

/** What Apply all does, said wherever it is offered. */
export const APPLY_ALL_NOTE =
  "Applies each draft fix in turn, so no spot is filled twice. Pickup approvals aren't included.";

export function hasDraftFix(items: CoverageSuggestionView[]): boolean {
  return items.some(
    (view) => suggestionActionLabel(view.suggestion.kind) && !view.suggestion.final,
  );
}

/** One selected date: how short it is and every suggestion for it. */
export function CoverageDayDetail({
  date,
  staffShort,
  items,
  busy,
  onApply,
  onApplyAll,
}: CoverageDayDetailProps) {
  const label = formatLongDate(date);
  return (
    <section className="dg-cc-detail" aria-label={`Suggestions for ${label}`}>
      <div className="min-w-0">
        <h3 className="dg-cc-detail-title">{label}</h3>
        <div className="dg-cc-detail-date dg-tabular-nums">
          {staffShort > 0
            ? `${formatCoverageNumber(staffShort)} staff short`
            : "Every requirement is staffed"}
        </div>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="dg-cc-caption">
              {items.length === 1 ? "1 suggestion" : `${items.length} suggestions`}
            </div>
            {onApplyAll && hasDraftFix(items) && (
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={onApplyAll}
                disabled={busy}
              >
                Apply all for this day
              </Button>
            )}
          </div>
          {onApplyAll && hasDraftFix(items) && (
            <p className="dg-cc-detail-line dg-cc-detail-line--muted">{APPLY_ALL_NOTE}</p>
          )}
          <ul className="dg-cc-sg-list">
            {items.map((view) => (
              <CoverageSuggestionRow
                key={view.suggestion.id}
                view={view}
                busy={busy}
                onApply={onApply}
              />
            ))}
          </ul>
        </div>
      ) : staffShort > 0 ? (
        <p className="dg-cc-detail-line dg-cc-detail-line--muted">
          No fixes found for this day. Select a short cell to see why each qualified person
          isn&apos;t suggested.
        </p>
      ) : null}
    </section>
  );
}

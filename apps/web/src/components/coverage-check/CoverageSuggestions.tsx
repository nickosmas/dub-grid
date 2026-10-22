"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type {
  CoverageSuggestion,
  CoverageSuggestionKind,
  CoverageSuggestionText,
} from "@dubgrid/schedule-core";
import { Button } from "@/components/Button";
import type { CoverageCellRef } from "./CoverageMatrixGrid";

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
  onSelect?: (target: CoverageCellRef) => void;
  onApply: (suggestion: CoverageSuggestion) => void;
  /** Ways to fix shows the detail; the main list keeps to title and effect. */
  showDetail?: boolean;
}

export function CoverageSuggestionRow({
  view,
  busy,
  onSelect,
  onApply,
  showDetail = false,
}: SuggestionRowProps) {
  const { suggestion, text } = view;
  const action = suggestionActionLabel(suggestion.kind);
  const target = suggestion.targets[0];
  const body = (
    <>
      <span className="dg-cc-sg-title">{text.title}</span>
      {(showDetail || !text.effect) && <span className="dg-cc-sg-detail">{text.detail}</span>}
      {text.effect && <span className="dg-cc-sg-effect dg-tabular-nums">{text.effect}</span>}
    </>
  );
  return (
    <li className="dg-cc-sg">
      {onSelect && target ? (
        <button
          type="button"
          className="dg-cc-sg-main"
          onClick={() => onSelect(target)}
          aria-label={`Show in Coverage Check: ${text.title}`}
        >
          {body}
        </button>
      ) : (
        <div className="dg-cc-sg-main">{body}</div>
      )}
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

interface CoverageSuggestionsProps {
  items: CoverageSuggestionView[];
  applied: AppliedCoverageSuggestion[];
  hasGaps: boolean;
  busyId: string | null;
  onSelect: (target: CoverageCellRef) => void;
  onApply: (suggestion: CoverageSuggestion) => void;
  onUndo: (appliedId: string) => void;
}

const TOP = 3;

export function CoverageSuggestions({
  items,
  applied,
  hasGaps,
  busyId,
  onSelect,
  onApply,
  onUndo,
}: CoverageSuggestionsProps) {
  const [showAll, setShowAll] = useState(false);
  if (!hasGaps && items.length === 0 && applied.length === 0) return null;
  const visible = showAll ? items : items.slice(0, TOP);

  return (
    <section className="dg-cc-suggestions" aria-label="Suggestions">
      <div className="dg-cc-caption">Suggestions</div>
      {items.length === 0 ? (
        hasGaps && (
          <p className="dg-cc-detail-line dg-cc-detail-line--muted">
            No fixes found. Each short day&apos;s detail says why.
          </p>
        )
      ) : (
        <ul className="dg-cc-sg-list">
          {visible.map((view) => (
            <CoverageSuggestionRow
              key={view.suggestion.id}
              view={view}
              busy={busyId != null}
              onSelect={onSelect}
              onApply={onApply}
            />
          ))}
        </ul>
      )}
      {items.length > TOP && (
        <button
          type="button"
          className="dg-cc-more"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
      {applied.length > 0 && (
        <div className="flex flex-col gap-1.5">
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
                    disabled={busyId != null}
                    aria-label={`Undo: ${entry.text}`}
                  >
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

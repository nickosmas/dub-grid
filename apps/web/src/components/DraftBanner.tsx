"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ChangeLegend from "@/components/ChangeLegend";
import { Eye, EyeOff } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";

interface DraftBannerProps {
  onPublish: () => void;
  onCancel: () => void;
  isPublishing?: boolean;
  isCanceling?: boolean;
  breakdown?: DraftBreakdown;
  showDiff?: boolean;
  onToggleDiff?: () => void;
  /**
   * Controls the diff-toggle label. "changes" promises before/after info
   * (used when modified/deleted drafts exist); "highlight" honestly describes
   * what the overlay does when only "new" drafts exist (no baseline to
   * compare against — the overlay just outlines the cells you drew).
   * Defaults to "changes" for backward compatibility.
   */
  diffMode?: "highlight" | "changes";
  canPublish?: boolean;
  /**
   * Optional dismiss handler. When provided, an "×" button hides the banner
   * until the underlying draft data changes again. Hiding is a UI affordance
   * only — drafts are not discarded.
   */
  onDismiss?: () => void;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

function BreakdownChips({ breakdown }: { breakdown: DraftBreakdown }) {
  const chips: { label: string; cls: string }[] = [];
  if (breakdown.newShifts > 0)
    chips.push({ label: `${breakdown.newShifts} new`, cls: "dg-draft-chip--new" });
  if (breakdown.modifiedShifts > 0)
    chips.push({ label: `${breakdown.modifiedShifts} modified`, cls: "dg-draft-chip--modified" });
  if (breakdown.deletedShifts > 0)
    chips.push({ label: `${breakdown.deletedShifts} deleted`, cls: "dg-draft-chip--deleted" });
  const noteCount = breakdown.newNotes + breakdown.deletedNotes;
  if (noteCount > 0) chips.push({ label: plural(noteCount, "note"), cls: "dg-draft-chip--notes" });

  if (chips.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {chips.map((c) => (
        <span key={c.cls} className={`dg-draft-chip ${c.cls}`}>
          {c.label}
        </span>
      ))}
    </span>
  );
}

export default function DraftBanner({
  onPublish,
  onCancel,
  isPublishing,
  isCanceling,
  breakdown,
  showDiff = false,
  onToggleDiff,
  diffMode = "changes",
  canPublish = true,
  onDismiss,
}: DraftBannerProps) {
  const isDisabled = isPublishing || isCanceling;
  const publishHint = canPublish
    ? "Save all draft changes to the live schedule"
    : "You don't have permission to publish schedules.";
  const diffOnLabel = diffMode === "highlight" ? "Hide Highlights" : "Hide Changes";
  const diffOffLabel = diffMode === "highlight" ? "Highlight New" : "Show Changes";
  const diffHint =
    diffMode === "highlight"
      ? "Outline the brand-new shifts you've drafted"
      : "Highlight differences from the published schedule";

  return (
    <div className="dg-draft-banner no-print" data-tour="draft-banner">
      <div className="dg-draft-banner-dot" />
      {breakdown ? <BreakdownChips breakdown={breakdown} /> : <span>Unpublished changes</span>}
      {showDiff && <ChangeLegend />}
      <div className="dg-draft-banner-actions">
        {onToggleDiff && (
          <Hint content={hint(diffHint)} side="bottom">
            <button
              data-tour="draft-banner-diff"
              onClick={onToggleDiff}
              className="dg-btn dg-btn-secondary dg-btn-sm"
              style={{
                background: showDiff ? "var(--color-brand-bg)" : undefined,
                color: showDiff ? "var(--color-accent-text)" : undefined,
              }}
            >
              {showDiff ? (
                <>
                  <EyeOff size={12} style={{ marginRight: 4 }} />
                  {diffOnLabel}
                </>
              ) : (
                <>
                  <Eye size={12} style={{ marginRight: 4 }} />
                  {diffOffLabel}
                </>
              )}
            </button>
          </Hint>
        )}
        <Hint content={hint("Delete all unpublished draft changes")} side="bottom">
          <button
            data-tour="draft-banner-discard"
            onClick={onCancel}
            disabled={isDisabled}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            style={{ color: "var(--color-danger-dark)" }}
          >
            <ButtonLoading
              loading={Boolean(isCanceling)}
              loadingLabel="Discarding"
              spinnerSize={12}
            >
              Discard
            </ButtonLoading>
          </button>
        </Hint>
        <Hint content={hint(publishHint)} side="bottom">
          <button
            data-tour="draft-banner-publish"
            onClick={onPublish}
            disabled={isDisabled || !canPublish}
            className="dg-btn dg-btn-primary dg-btn-sm"
          >
            <ButtonLoading
              loading={Boolean(isPublishing)}
              loadingLabel="Publishing"
              spinnerSize={12}
            >
              Publish
            </ButtonLoading>
          </button>
        </Hint>
        {onDismiss && (
          <Hint content={hint("Hide this banner for the rest of this session")} side="bottom">
            <button type="button" onClick={onDismiss} className="dg-btn dg-btn-secondary dg-btn-sm">
              Close
            </button>
          </Hint>
        )}
      </div>
    </div>
  );
}

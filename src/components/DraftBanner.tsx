"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";
import ButtonSpinner from "@/components/ButtonSpinner";
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
  canPublish?: boolean;
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
  if (noteCount > 0)
    chips.push({ label: plural(noteCount, "note"), cls: "dg-draft-chip--notes" });

  if (chips.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {chips.map((c) => (
        <span key={c.cls} className={`dg-draft-chip ${c.cls}`}>{c.label}</span>
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
  canPublish = true,
}: DraftBannerProps) {
  const isDisabled = isPublishing || isCanceling;
  const publishHint = canPublish
    ? "Save all draft changes to the live schedule"
    : "You don't have permission to publish schedules.";

  return (
    <div className="dg-draft-banner no-print" data-tour="draft-banner">
      <div className="dg-draft-banner-dot" />
      {breakdown ? (
        <BreakdownChips breakdown={breakdown} />
      ) : (
        <span>Unpublished changes</span>
      )}
      <div className="dg-draft-banner-actions">
        {onToggleDiff && (
          <Hint content={hint("Highlight differences from the published schedule")} side="bottom">
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
                  Hide Changes
                </>
              ) : (
                <>
                  <Eye size={12} style={{ marginRight: 4 }} />
                  Show Changes
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
            {isCanceling ? (
              <>
                <ButtonSpinner size={12} />
                Discarding…
              </>
            ) : "Discard"}
          </button>
        </Hint>
        <Hint content={hint(publishHint)} side="bottom">
          <button
            data-tour="draft-banner-publish"
            onClick={onPublish}
            disabled={isDisabled || !canPublish}
            className="dg-btn dg-btn-primary dg-btn-sm"
          >
            {isPublishing ? (
              <>
                <ButtonSpinner size={12} />
                Publishing…
              </>
            ) : "Publish"}
          </button>
        </Hint>
      </div>
    </div>
  );
}

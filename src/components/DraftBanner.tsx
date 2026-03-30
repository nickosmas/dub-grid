"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";
import ButtonSpinner from "@/components/ButtonSpinner";
import { Eye, EyeOff } from "lucide-react";

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

  return (
    <div className="dg-draft-banner no-print">
      <div className="dg-draft-banner-dot" />
      {breakdown ? (
        <BreakdownChips breakdown={breakdown} />
      ) : (
        <span>Unpublished changes</span>
      )}
      <div className="dg-draft-banner-actions">
        {onToggleDiff && (
          <button
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
        )}
        <button
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
        {canPublish && (
          <button
            onClick={onPublish}
            disabled={isDisabled}
            className="dg-btn dg-btn-primary dg-btn-sm"
          >
            {isPublishing ? (
              <>
                <ButtonSpinner size={12} />
                Publishing…
              </>
            ) : "Publish"}
          </button>
        )}
      </div>
    </div>
  );
}

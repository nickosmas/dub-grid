"use client";

import type { DraftBreakdown } from "@/lib/draft-utils";

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
            className="dg-btn dg-btn-secondary"
            style={{
              fontSize: "var(--dg-fs-caption)",
              padding: "6px 14px",
              background: showDiff ? "var(--color-info-bg)" : undefined,
              color: showDiff ? "var(--color-accent-text)" : undefined,
            }}
          >
            {showDiff ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Hide Changes
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Show Changes
              </>
            )}
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={isDisabled}
          className="dg-btn dg-btn-secondary"
          style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 14px", color: "var(--color-danger-dark)" }}
        >
          {isCanceling ? (
            <>
              <svg className="dg-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Discarding…
            </>
          ) : "Discard"}
        </button>
        {canPublish && (
          <button
            onClick={onPublish}
            disabled={isDisabled}
            className="dg-btn dg-btn-primary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "5px 12px" }}
          >
            {isPublishing ? (
              <>
                <svg className="dg-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Publishing…
              </>
            ) : "Publish"}
          </button>
        )}
      </div>
    </div>
  );
}

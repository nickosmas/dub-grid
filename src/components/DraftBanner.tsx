"use client";

interface DraftBannerProps {
  onPublish: () => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  isPublishing?: boolean;
  isCanceling?: boolean;
  isSavingDraft?: boolean;
  hasChanges?: boolean;
  changeCount?: number;
}

export default function DraftBanner({
  onPublish,
  onCancel,
  onSaveDraft,
  isPublishing,
  isCanceling,
  isSavingDraft,
  hasChanges = false,
  changeCount = 0,
}: DraftBannerProps) {
  const isDisabled = isPublishing || isCanceling || isSavingDraft;

  const message = hasChanges
    ? `You have ${changeCount} unpublished change${changeCount !== 1 ? "s" : ""}`
    : "Editing schedule…";

  return (
    <div className="dg-draft-banner no-print">
      <div className="dg-draft-banner-dot" />
      <span>{message}</span>
      <div className="dg-draft-banner-actions">
        {hasChanges && (
          <button
            onClick={onSaveDraft}
            disabled={isDisabled}
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            {isSavingDraft ? (
              <>
                <svg className="dg-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Saving…
              </>
            ) : "Save Draft"}
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={isDisabled}
          className="dg-btn dg-btn-secondary"
          style={{ fontSize: 12, padding: "5px 12px", color: hasChanges ? "#DC2626" : undefined }}
        >
          {isCanceling ? (
            <>
              <svg className="dg-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Discarding…
            </>
          ) : hasChanges ? "Discard" : "Exit"}
        </button>
        <button
          onClick={onPublish}
          disabled={isDisabled || !hasChanges}
          className="dg-btn dg-btn-primary"
          style={{ fontSize: 12, padding: "5px 12px", opacity: hasChanges ? 1 : 0.4, cursor: hasChanges ? "pointer" : "not-allowed" }}
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
      </div>
    </div>
  );
}

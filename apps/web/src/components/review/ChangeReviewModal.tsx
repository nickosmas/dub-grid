"use client";

import Modal from "@/components/Modal";
import { ButtonLoading } from "@/components/ButtonSpinner";

export interface ReviewChange {
  key: string;
  label: string;
  previousDisplay: string;
  nextDisplay: string;
  sensitive: boolean;
}

interface ChangeReviewModalProps {
  title: string;
  description: string;
  changes: ReviewChange[];
  saving?: boolean;
  confirmLabel?: string;
  warningText?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ChangeReviewModal({
  title,
  description,
  changes,
  saving = false,
  confirmLabel = "Confirm Save",
  warningText,
  onCancel,
  onConfirm,
}: ChangeReviewModalProps) {
  const hasSensitiveChanges = changes.some((change) => change.sensitive);

  return (
    <Modal title={title} onClose={onCancel} style={{ maxWidth: 720, width: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-label)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>

        {hasSensitiveChanges ? (
          <div
            style={{
              padding: 12,
              borderRadius: "var(--dg-radius-md)",
              border: "1px solid var(--color-warning-border)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning-text)",
              fontSize: "var(--dg-fs-label)",
              fontWeight: 600,
            }}
          >
            {warningText ?? "This save includes sensitive changes."}
          </div>
        ) : null}

        <div
          style={{
            border: "1px solid var(--color-border-light)",
            borderRadius: "var(--dg-radius-md)",
            overflow: "hidden",
          }}
        >
          {changes.map((change, index) => (
            <div
              key={change.key}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 180px) 1fr 1fr",
                gap: 12,
                padding: "12px 14px",
                borderTop: index === 0 ? "none" : "1px solid var(--color-border-light)",
                background: change.sensitive ? "var(--color-bg-secondary)" : "var(--color-surface)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {change.label}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-text-faint)",
                    marginBottom: 4,
                  }}
                >
                  Current
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {change.previousDisplay}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-text-faint)",
                    marginBottom: 4,
                  }}
                >
                  New
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-primary)",
                    fontWeight: 600,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {change.nextDisplay}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Go Back
          </button>
          <button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={onConfirm}
            disabled={saving}
          >
            <ButtonLoading loading={saving} loadingLabel="Saving">
              {confirmLabel}
            </ButtonLoading>
          </button>
        </div>
      </div>
    </Modal>
  );
}

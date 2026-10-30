"use client";

import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Banner } from "@/components/ui/Banner";
import { ShieldAlert, Save } from "lucide-react";

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
  confirmLabel = "Save",
  warningText,
  onCancel,
  onConfirm,
}: ChangeReviewModalProps) {
  const hasSensitiveChanges = changes.some((change) => change.sensitive);

  return (
    <Modal
      alert={{ icon: Save }}
      title={title}
      onClose={onCancel}
      style={{ maxWidth: 720, width: "100%" }}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Go Back
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            onClick={onConfirm}
            disabled={saving}
          >
            <ButtonLoading loading={saving}>{confirmLabel}</ButtonLoading>
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-label)",
            color: "var(--dg-color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>

        {hasSensitiveChanges ? (
          <Banner tone="warning" icon={ShieldAlert}>
            {warningText ?? "This save includes sensitive changes."}
          </Banner>
        ) : null}

        <div
          style={{
            border: "1px solid var(--dg-color-border-light)",
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
                borderTop: index === 0 ? "none" : "1px solid var(--dg-color-border-light)",
                background: change.sensitive
                  ? "var(--dg-color-bg-secondary)"
                  : "var(--dg-color-surface)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--dg-type-field-title-size)",
                  fontWeight: "var(--dg-type-field-title-weight)",
                  color: "var(--dg-type-field-title-color)",
                  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                  lineHeight: "var(--dg-type-field-title-line-height)",
                }}
              >
                {change.label}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "var(--dg-type-field-title-size)",
                    fontWeight: "var(--dg-type-field-title-weight)",
                    color: "var(--dg-type-field-title-color)",
                    marginBottom: 4,
                  }}
                >
                  Current
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-secondary)",
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
                    fontSize: "var(--dg-type-field-title-size)",
                    fontWeight: "var(--dg-type-field-title-weight)",
                    color: "var(--dg-type-field-title-color)",
                    marginBottom: 4,
                  }}
                >
                  New
                </div>
                <div
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--dg-color-text-primary)",
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
      </div>
    </Modal>
  );
}

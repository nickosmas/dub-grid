"use client";

import Modal from "@/components/Modal";

interface ConfirmDialogProps {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void;
  isSecondaryLoading?: boolean;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
  secondaryConfirmLabel,
  onSecondaryConfirm,
  isSecondaryLoading = false,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === "danger"
      ? "dg-btn dg-btn-danger-filled"
      : "dg-btn dg-btn-primary";

  const confirmStyle: React.CSSProperties | undefined =
    variant === "warning"
      ? { background: "var(--color-warning)", border: "none" }
      : undefined;

  return (
    <Modal title={title} onClose={onCancel} style={{ maxWidth: 420 }}>
      <div
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: "var(--color-text-secondary)",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {message}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          className="dg-btn dg-btn-secondary"
          onClick={onCancel}
          disabled={isLoading || isSecondaryLoading}
        >
          {cancelLabel}
        </button>
        <button
          className={confirmClass}
          style={confirmStyle}
          onClick={onConfirm}
          disabled={isLoading || isSecondaryLoading}
        >
          {isLoading ? (
            <>
              <svg
                className="dg-spinner"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              {confirmLabel}
            </>
          ) : (
            confirmLabel
          )}
        </button>
        {secondaryConfirmLabel && onSecondaryConfirm && (
          <button
            className={confirmClass}
            style={confirmStyle}
            onClick={onSecondaryConfirm}
            disabled={isLoading || isSecondaryLoading}
          >
            {isSecondaryLoading ? (
              <>
                <svg
                  className="dg-spinner"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                {secondaryConfirmLabel}
              </>
            ) : (
              secondaryConfirmLabel
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

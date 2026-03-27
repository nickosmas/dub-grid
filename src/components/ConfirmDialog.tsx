"use client";

import Modal from "@/components/Modal";
import { ButtonLoading } from "@/components/ButtonSpinner";

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
          <ButtonLoading loading={isLoading} spinnerSize={16}>{confirmLabel}</ButtonLoading>
        </button>
        {secondaryConfirmLabel && onSecondaryConfirm && (
          <button
            className={confirmClass}
            style={confirmStyle}
            onClick={onSecondaryConfirm}
            disabled={isLoading || isSecondaryLoading}
          >
            <ButtonLoading loading={isSecondaryLoading} spinnerSize={16}>{secondaryConfirmLabel}</ButtonLoading>
          </button>
        )}
      </div>
    </Modal>
  );
}

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
  maxWidth?: number;
  wrapActions?: boolean;
  confirmDisabled?: boolean;
  secondaryConfirmDisabled?: boolean;
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
  maxWidth = 420,
  wrapActions = false,
  confirmDisabled = false,
  secondaryConfirmDisabled = false,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === "danger"
      ? "dg-btn dg-btn-danger-filled"
      : "dg-btn dg-btn-primary";

  const confirmStyle: React.CSSProperties | undefined =
    variant === "warning"
      ? { background: "var(--color-warning)", border: "none" }
      : undefined;

  const descId = "confirm-dialog-desc";
  const actionDisabled = isLoading || isSecondaryLoading;
  const cancelButtonStyle = wrapActions
    ? { marginRight: "auto", minWidth: 120 }
    : undefined;
  const confirmButtonStyle = wrapActions
    ? {
        ...confirmStyle,
        minWidth: secondaryConfirmLabel && onSecondaryConfirm ? 170 : 148,
      }
    : confirmStyle;

  return (
    <Modal
      title={title}
      onClose={onCancel}
      style={{ maxWidth }}
      aria-describedby={descId}
    >
      <div
        id={descId}
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: "var(--color-text-secondary)",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {message}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: wrapActions ? "wrap" : "nowrap",
          gap: 12,
          justifyContent: "flex-end",
          alignItems: "stretch",
        }}
      >
        <button
          className="dg-btn dg-btn-secondary"
          onClick={onCancel}
          disabled={actionDisabled}
          style={cancelButtonStyle}
        >
          {cancelLabel}
        </button>
        <button
          className={confirmClass}
          style={confirmButtonStyle}
          onClick={onConfirm}
          disabled={actionDisabled || confirmDisabled}
        >
          <ButtonLoading loading={isLoading} spinnerSize={16}>{confirmLabel}</ButtonLoading>
        </button>
        {secondaryConfirmLabel && onSecondaryConfirm && (
          <button
            className={confirmClass}
            style={confirmButtonStyle}
            onClick={onSecondaryConfirm}
            disabled={actionDisabled || secondaryConfirmDisabled}
          >
            <ButtonLoading loading={isSecondaryLoading} spinnerSize={16}>{secondaryConfirmLabel}</ButtonLoading>
          </button>
        )}
      </div>
    </Modal>
  );
}

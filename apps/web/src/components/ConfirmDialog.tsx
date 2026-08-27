"use client";

import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

interface ConfirmDialogProps {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  /**
   * Overrides the busy state the dialog works out for itself. Only needed when
   * the pending flag lives outside this confirm (a shared `actionLoading` keyed
   * by row, say); an async `onConfirm` already spins on its own.
   */
  isLoading?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void | Promise<unknown>;
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
  isLoading,
  onConfirm,
  onCancel,
  secondaryConfirmLabel,
  onSecondaryConfirm,
  isSecondaryLoading,
  maxWidth = 420,
  wrapActions = false,
  confirmDisabled = false,
  secondaryConfirmDisabled = false,
}: ConfirmDialogProps) {
  // Confirming is the press most worth double-clicking: the dialog has just
  // told the user something irreversible is about to happen, and a slow
  // request leaves the button sitting there looking unpressed. The latch is
  // synchronous, so the second click is dropped before React can re-render;
  // `isRunning` only drives the spinner. A caller passing its own `isLoading`
  // still wins, and a synchronous `onConfirm` never spins at all.
  const confirm = useAsyncAction(onConfirm);
  const secondaryConfirm = useAsyncAction(onSecondaryConfirm ?? (() => {}));

  const confirmBusy = isLoading ?? confirm.isRunning;
  const secondaryBusy = isSecondaryLoading ?? secondaryConfirm.isRunning;

  const confirmClass =
    variant === "danger" ? "dg-btn dg-btn-danger-filled" : "dg-btn dg-btn-primary";

  const confirmStyle: React.CSSProperties | undefined =
    variant === "warning" ? { background: "var(--dg-color-warning)", border: "none" } : undefined;

  const descId = "confirm-dialog-desc";
  const actionDisabled = confirmBusy || secondaryBusy;
  const cancelButtonStyle = wrapActions ? { marginRight: "auto", minWidth: 120 } : undefined;
  const confirmButtonStyle = wrapActions
    ? {
        ...confirmStyle,
        minWidth: secondaryConfirmLabel && onSecondaryConfirm ? 170 : 148,
      }
    : confirmStyle;

  return (
    <Modal title={title} onClose={onCancel} style={{ maxWidth }} aria-describedby={descId}>
      <div
        id={descId}
        style={{
          fontSize: "var(--dg-fs-body-sm)",
          color: "var(--dg-color-text-secondary)",
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
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={onCancel}
          disabled={actionDisabled}
          style={cancelButtonStyle}
        >
          {cancelLabel}
        </Button>
        <Button
          className={confirmClass}
          style={confirmButtonStyle}
          onClick={confirm.run}
          disabled={actionDisabled || confirmDisabled}
        >
          <ButtonLoading loading={confirmBusy} spinnerSize={16}>
            {confirmLabel}
          </ButtonLoading>
        </Button>
        {secondaryConfirmLabel && onSecondaryConfirm && (
          <Button
            className={confirmClass}
            style={confirmButtonStyle}
            onClick={secondaryConfirm.run}
            disabled={actionDisabled || secondaryConfirmDisabled}
          >
            <ButtonLoading loading={secondaryBusy} spinnerSize={16}>
              {secondaryConfirmLabel}
            </ButtonLoading>
          </Button>
        )}
      </div>
    </Modal>
  );
}

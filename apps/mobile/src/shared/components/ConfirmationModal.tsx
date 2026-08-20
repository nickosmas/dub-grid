import { type ReactNode } from "react";
import { BottomSheetModal, SheetActions, SheetCopy, SheetHeader } from "./BottomSheetModal";
import { Button, type ButtonTone } from "./Button";
import { hapticImpact } from "../lib/haptics";

type ConfirmationTone = Extract<
  ButtonTone,
  "primary" | "secondary" | "neutral" | "danger" | "warning"
>;

/**
 * The app's one confirmation surface, built on `BottomSheetModal` rather than
 * beside it: this file used to carry its own copy of the sheet's Modal props,
 * backdrop, grabber, corner radius, elevation and drag-to-dismiss wiring, so
 * every change to the sheet design had to be made twice and the two drifted.
 */
export function ConfirmationModal({
  visible,
  title,
  body,
  children,
  confirmLabel,
  confirmPendingLabel,
  cancelLabel = "Cancel",
  confirmTone = "primary",
  loading = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body?: string;
  children?: ReactNode;
  confirmLabel: string;
  /**
   * The confirm action in progress ("Deleting"), shown beside the spinner while
   * `loading`. Falls back to `confirmLabel`, which reads as work not yet
   * started, so any dialog that can load should pass it.
   */
  confirmPendingLabel?: string;
  cancelLabel?: string;
  confirmTone?: ConfirmationTone;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDestructive = confirmTone === "danger";

  const handleConfirm = () => {
    if (isDestructive) {
      hapticImpact("medium");
    }
    onConfirm();
  };

  return (
    <BottomSheetModal
      accessibilityRole="alert"
      // A pending confirmation can't be dragged or tapped away; the grabber
      // stays, as it does on every sheet, and the drag settles back instead.
      dismissDisabled={loading}
      header={<SheetHeader title={title} />}
      // The shared sheet caps its height, which this dialog never used to do.
      // Callers pass a `children` form (the People status-change reason), and
      // with the keyboard up that content would otherwise clip below the fold.
      scrollable
      visible={visible}
      onDismiss={onCancel}
    >
      {body ? <SheetCopy body={body} /> : null}
      {children}
      <SheetActions>
        <Button
          label={confirmLabel}
          loading={loading}
          loadingLabel={confirmPendingLabel}
          onPress={handleConfirm}
          tone={confirmTone}
        />
        <Button disabled={loading} label={cancelLabel} onPress={onCancel} tone="neutral" />
      </SheetActions>
    </BottomSheetModal>
  );
}

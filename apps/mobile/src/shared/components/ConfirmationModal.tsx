import { type ReactNode } from "react";
import { BottomSheetModal, SheetActions, SheetCopy, SheetHeader } from "./BottomSheetModal";
import { Button, type ButtonTone } from "./Button";
import { hapticImpact } from "../lib/haptics";
import { useAsyncAction } from "../hooks/useAsyncAction";

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
  loading,
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
  /**
   * Overrides the busy state `Button` works out for itself. Only needed when
   * the pending flag lives outside this sheet; an async `onConfirm` already
   * spins on its own.
   */
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<unknown>;
}) {
  const isDestructive = confirmTone === "danger";

  // The sheet latches the confirm itself rather than leaving it to `Button`,
  // because the busy state has a second job here: a pending confirmation must
  // also refuse to be dragged away. Doing it in one place keeps the spinner
  // and `dismissDisabled` reading from the same flag.
  const confirm = useAsyncAction(() => {
    if (isDestructive) {
      hapticImpact("medium");
    }
    return onConfirm();
  });
  const isBusy = loading ?? confirm.isRunning;

  return (
    <BottomSheetModal
      accessibilityRole="alert"
      // A pending confirmation can't be dragged or tapped away; the grabber
      // stays, as it does on every sheet, and the drag settles back instead.
      dismissDisabled={isBusy}
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
          loading={isBusy}
          loadingLabel={confirmPendingLabel}
          onPress={confirm.run}
          tone={confirmTone}
        />
        <Button disabled={isBusy} label={cancelLabel} onPress={onCancel} tone="neutral" />
      </SheetActions>
    </BottomSheetModal>
  );
}

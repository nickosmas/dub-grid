import { useCallback, useState } from "react";
import { useModalHandoff } from "./useModalHandoff";

/** Exactly the props `ConfirmationModal` needs. Spread it, don't destructure. */
export type DiscardConfirmationProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /**
   * Never "danger": throwing away unsaved edits isn't destructive under the
   * button rules, so neither Save nor Discard is red.
   */
  confirmTone: "primary";
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  /** Discard, beside Save and Keep editing, when the surface can save. */
  secondaryAction?: { label: string; onPress: () => void; keepsCancel: boolean };
};

export type UnsavedChangesGuard = {
  /** Echoed back so `useNavigationDiscardGuard` needn't be told twice. */
  isDirty: boolean;
  /** Echoed back for the same reason. */
  disabled: boolean;
  /** True while the discard confirmation is on screen. */
  isConfirming: boolean;
  /**
   * The single exit funnel: a sheet's `onDismiss` and its Cancel button both
   * point here. Takes no arguments on purpose, so it can be handed straight to
   * `onPress` without a `GestureResponderEvent` landing in an exit callback.
   *
   * Clean: runs `onDiscard` then `onClose` immediately. Dirty: raises the
   * confirmation and returns, leaving the sheet's `visible` true — which is
   * what makes a dragged sheet settle back into place instead of stranding
   * off-screen.
   */
  requestClose: () => void;
  /**
   * `requestClose` with a caller-supplied exit instead of the configured
   * `onClose`. `useNavigationDiscardGuard` uses it to dispatch the navigation
   * action it intercepted; a screen can use it to guard one specific
   * transition.
   */
  requestExit: (exit: () => void) => void;
  /** Reset the draft without leaving — an edit panel's explicit Discard button. */
  discard: () => void;
  /** Dismiss the confirmation and stay put. */
  cancel: () => void;
  confirmationProps: DiscardConfirmationProps;
};

/**
 * The app's one unsaved-changes guard.
 *
 * Every way out of a sheet already funnels through `BottomSheetModal`'s
 * `onDismiss`, and `useSheetDragToDismiss` treats that as a veto point: leave
 * `visible` true and a dragged sheet animates back up. This hook is what turns
 * that veto into a decision the user makes rather than work that vanishes.
 *
 * With `onSave` the question offers Save, Discard and Keep editing; without
 * it, Discard and Keep editing. A surface passes `onSave` only while its form
 * can be saved in one step: an invalid form, a save that asks a question of
 * its own, and a decision (a create, an invite, a request) offer no Save.
 *
 * Rules that look like details and aren't:
 *
 * - **`onDiscard` runs on every exit through the guard, clean or dirty,** except
 *   after a Save: it is the reset, not a side effect of confirming. Three of
 *   the five hand-rolled copies this replaces reset the draft on close and one
 *   forgot to, so a reopened sheet showed stale input. A saved draft is the
 *   surface's own to settle, and resetting it to the baseline read before the
 *   save would bring back the old values until the refetch lands.
 * - **`disabled` means two different things, deliberately.** For a sheet it
 *   swallows the exit outright, as the old `if (isPending) return;` did: a
 *   save in flight must not be interrupted. For a screen it only stops
 *   `useNavigationDiscardGuard` preventing removal, so a back press mid-save
 *   leaves rather than trapping the user behind a modal they cannot answer.
 * - **A failed Save stays.** The question closes, the surface shows its own
 *   error, and the exit is dropped rather than retried.
 */
export function useUnsavedChangesGuard({
  isDirty,
  disabled = false,
  onDiscard,
  onClose,
  onSave,
  title,
  body = "You haven't saved what you changed here.",
  confirmLabel = "Discard",
  saveLabel = "Save",
  cancelLabel = "Keep editing",
}: {
  isDirty: boolean;
  /** A write is in flight. Nothing may interrupt it. */
  disabled?: boolean;
  /** Reset the draft to its baseline. Must be synchronous. */
  onDiscard?: () => void;
  /**
   * Close the surface: a sheet's `onDismiss`, an inline panel's
   * `setEditing(false)`. Must flip `visible` synchronously: a dragged sheet has
   * already parked off-screen by the time this runs, and only a synchronous
   * close keeps it there instead of animating it back up for a frame.
   */
  onClose?: () => void;
  /**
   * Save what the surface holds and say whether it worked. On `true` the exit
   * goes ahead; on `false` (or a throw) the surface has shown its own error
   * and nothing leaves. Running the exit again after a save that already
   * closed the surface must be harmless.
   */
  onSave?: () => boolean | Promise<boolean>;
  /** Default: "Save your changes?" with `onSave`, else "Discard your changes?". */
  title?: string;
  /** Default: "You haven't saved what you changed here." */
  body?: string;
  /** The discard answer. Default: "Discard". */
  confirmLabel?: string;
  /** Default: "Save". */
  saveLabel?: string;
  /**
   * Default: "Keep editing". Deliberately not "Cancel": on a sheet whose own
   * dismiss button is Cancel, a confirmation offering Cancel asks the user to
   * cancel their cancel. Override it where "editing" isn't what they were
   * doing, as in a two-factor setup.
   */
  cancelLabel?: string;
}): UnsavedChangesGuard {
  // The exit the user is being asked about, boxed so `useState` doesn't mistake
  // the function for an updater. `null` means no confirmation is showing.
  const [pendingExit, setPendingExit] = useState<{ run: () => void } | null>(null);
  const handoff = useModalHandoff();

  const requestExit = useCallback(
    (exit: () => void) => {
      if (disabled) return;
      if (!isDirty) {
        onDiscard?.();
        exit();
        return;
      }
      setPendingExit({ run: exit });
    },
    [disabled, isDirty, onDiscard],
  );

  const requestClose = useCallback(() => {
    requestExit(() => onClose?.());
  }, [onClose, requestExit]);

  const discard = useCallback(() => {
    if (disabled) return;
    onDiscard?.();
  }, [disabled, onDiscard]);

  const cancel = useCallback(() => setPendingExit(null), []);

  const discardAndLeave = useCallback(() => {
    const exit = pendingExit;
    // The confirmation goes first and on its own: it is a `<Modal>` presented
    // over the sheet's `<Modal>`, and tearing both down in one commit leaves the
    // sheet stuck on screen. By this point the sheet is back in place anyway
    // (raising this confirmation is what settled a dragged one), so there is no
    // off-screen sheet waiting on a synchronous close.
    setPendingExit(null);
    onDiscard?.();
    handoff(() => exit?.run());
  }, [handoff, onDiscard, pendingExit]);

  const saveAndLeave = useCallback(async () => {
    const exit = pendingExit;
    let saved = false;
    try {
      saved = onSave ? await onSave() : false;
    } catch {
      saved = false;
    }
    // Held open while the save runs, so the drawn confirmation spins rather
    // than vanishing over a sheet that is still busy.
    setPendingExit(null);
    if (saved) handoff(() => exit?.run());
  }, [handoff, onSave, pendingExit]);

  const answers = onSave
    ? {
        confirmLabel: saveLabel,
        onConfirm: saveAndLeave,
        secondaryAction: { label: confirmLabel, onPress: discardAndLeave, keepsCancel: true },
      }
    : { confirmLabel, onConfirm: discardAndLeave };

  return {
    isDirty,
    disabled,
    isConfirming: pendingExit != null,
    requestClose,
    requestExit,
    discard,
    cancel,
    confirmationProps: {
      visible: pendingExit != null,
      title: title ?? (onSave ? "Save your changes?" : "Discard your changes?"),
      body,
      confirmTone: "primary",
      cancelLabel,
      onCancel: cancel,
      ...answers,
    },
  };
}

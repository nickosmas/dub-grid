import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import type { UnsavedChangesSave } from "@/components/UnsavedChangesDialog";
import { lockPageScroll } from "@/lib/page-scroll-lock";

/** Matches .dg-panel's exit animation duration in globals.css. */
export const SLIDEOVER_CLOSE_MS = 200;

/** Mounted panels, oldest first; only the most recent one answers Escape. */
const escapeStack: RefObject<() => void>[] = [];

/**
 * Closes the panel on Escape from anywhere in the document, so it works
 * whether or not focus is inside the panel. Only the top-most mounted panel
 * responds, and a modal stacked above it (ConfirmDialog, Modal) owns the key
 * instead, so Escape never yanks the panel out from under an open dialog.
 */
export function useSlideoverEscape(onEscape: () => void) {
  const onEscapeRef = useLatestRef(onEscape);

  useEffect(() => {
    escapeStack.push(onEscapeRef);
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (escapeStack[escapeStack.length - 1] !== onEscapeRef) return;
      if (document.querySelector(".dg-modal-overlay")) return;
      onEscapeRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = escapeStack.lastIndexOf(onEscapeRef);
      if (index !== -1) escapeStack.splice(index, 1);
    };
  }, [onEscapeRef]);
}

/**
 * Shared open/close animation state for every slide-over panel (the shift
 * editor, staff detail panels, coverage/publish-history/requests panels,
 * etc). `close()` starts the exit animation immediately and defers the real
 * unmount (`onClose`) until it finishes, so the panel is still mounted - and
 * animating - for the full CSS transition instead of vanishing the instant
 * the caller's state flips.
 *
 * Also locks page scroll for as long as the panel is mounted, so the
 * darkened backdrop content can't be scrolled underneath it, and closes on
 * Escape. Pass `escape: false` to handle Escape yourself (for example behind
 * an unsaved-changes guard) via `useSlideoverEscape`.
 *
 * Pass `unsaved` for a panel that edits: then `close()` (Escape, the backdrop,
 * the X) asks before throwing the edits away, and the caller renders
 * `unsavedChangesDialog`. `forceClose()` skips the question, for a close that
 * follows a save.
 */
export function useSlideoverClose(
  onClose: () => void,
  {
    escape = true,
    unsaved,
  }: {
    escape?: boolean;
    unsaved?: {
      hasUnsavedChanges: boolean;
      onSave?: UnsavedChangesSave;
      /** False when a successful save already closes the panel itself. */
      closeAfterSave?: boolean;
    };
  } = {},
) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useLatestRef(onClose);

  useLayoutEffect(() => lockPageScroll(), []);

  const forceClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      onCloseRef.current();
    }, SLIDEOVER_CLOSE_MS);
  }, [onCloseRef]);

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: Boolean(unsaved?.hasUnsavedChanges),
    onDiscard: forceClose,
    onSave: unsaved?.onSave,
    onSaved: unsaved?.closeAfterSave === false ? undefined : forceClose,
  });

  const close = useCallback(() => {
    if (requestClose()) forceClose();
  }, [forceClose, requestClose]);

  useSlideoverEscape(escape ? close : () => {});

  return { closing, close, forceClose, unsavedChangesDialog };
}

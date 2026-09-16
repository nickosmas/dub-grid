import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

/** Matches .dg-panel's exit animation duration in globals.css. */
export const SLIDEOVER_CLOSE_MS = 200;

/**
 * Reference-counted so stacked or rapidly re-mounted panels don't have one
 * unmount's cleanup re-enable scroll while another panel is still open.
 */
let lockCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

function lockBodyScroll() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPaddingRight = document.body.style.paddingRight;
    // Removing the scrollbar shrinks the visual viewport, shifting fixed-
    // position content (including the panel itself) sideways as the lock
    // engages. Padding by the scrollbar's width keeps the layout width
    // constant so nothing jumps when the panel opens.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPaddingRight = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }
  }
  lockCount += 1;
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;
  }
}

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
 */
export function useSlideoverClose(onClose: () => void, { escape = true } = {}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useLatestRef(onClose);

  useLayoutEffect(() => {
    lockBodyScroll();
    return unlockBodyScroll;
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      onCloseRef.current();
    }, SLIDEOVER_CLOSE_MS);
  }, [onCloseRef]);

  useSlideoverEscape(escape ? close : () => {});

  return { closing, close };
}

import { useCallback, useEffect, useRef } from "react";

/**
 * How long a modal takes to leave. Covers the `<Modal>`'s own fade and the
 * sheet's exit timing underneath it, with enough margin that the second
 * transition starts after UIKit considers the first finished rather than
 * exactly on its last frame.
 */
const MODAL_TRANSITION_MS = 260;

/**
 * Sequences two modal transitions that would otherwise land in the same React
 * commit.
 *
 * Every confirmation in the app is a sibling `<Modal>` presented over the sheet
 * it guards, so confirming one means dismissing two modals at once. UIKit will
 * not dismiss a presenting view controller while its presented child is still
 * mid-dismissal, and React Native drops that second `dismissViewControllerAnimated:`
 * without an error — the confirmation goes away and the sheet underneath stays
 * on screen with a live backdrop, which is the "sheet refuses to dismiss" report.
 * Presenting one modal while another is dismissing fails the same way.
 *
 * The returned function defers its callback until the first transition is done.
 * Only ever put the *second* transition behind it: the first has to stay
 * synchronous, and a dragged sheet in particular has already parked itself
 * off-screen by the time its exit callback runs, so deferring that one would
 * animate it back up for a beat before it closed.
 */
export function useModalHandoff() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return useCallback((next: () => void) => {
    // A second handoff replaces the first rather than queueing behind it: two
    // pending transitions means the user changed their mind, and only the last
    // one describes where they actually want to end up.
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      next();
    }, MODAL_TRANSITION_MS);
  }, []);
}

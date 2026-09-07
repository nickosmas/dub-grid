/**
 * The words an editor's action row is allowed to use, and which one its dismiss
 * button shows.
 *
 * Shared because the two apps have to agree: a person who learns what Discard
 * does on the web schedule should not meet a different rule in the mobile app.
 * Both delegate here rather than keeping a copy each, the same way
 * `@dubgrid/client-errors` owns the client-facing error copy.
 */
export const EDITOR_ACTION_LABELS = {
  save: "Save",
  /**
   * Throw away unsaved edits. On a dismiss button this resets the fields in
   * place and deliberately leaves the editor open, so the reset values can be
   * carried on with; it is also the destructive button in the unsaved-changes
   * dialog, where confirming does leave.
   */
  discard: "Discard",
  /** Abandon a draft that was never saved. Dismisses, and drops the new row. */
  cancel: "Cancel",
  /** Nothing to lose. Dismisses the editor. */
  close: "Close",
} as const;

/**
 * Which word the dismiss button shows, given what the editor is holding.
 *
 * The three cases answer three different questions, which is why one button can
 * carry all of them:
 *
 * - **Creating** - "I never wanted this": Cancel, and the unsaved row goes with
 *   it.
 * - **Dirty** - "throw away what I typed, but I'm still here": Discard, which
 *   resets the fields and must NOT close. Closing is the back gesture's job on
 *   mobile and the X's on web.
 * - **Clean** - nothing to lose: Close.
 */
export function getEditorDismissLabel({
  hasUnsavedChanges,
  isCreating = false,
}: {
  hasUnsavedChanges: boolean;
  isCreating?: boolean;
}): string {
  if (isCreating) return EDITOR_ACTION_LABELS.cancel;
  return hasUnsavedChanges ? EDITOR_ACTION_LABELS.discard : EDITOR_ACTION_LABELS.close;
}

/**
 * The same rule for mobile, minus `Close`.
 *
 * The two apps agree on what the button *does* - Discard resets in place, and
 * only the platform's own dismissal leaves - and differ on one word. A sheet or
 * a pushed screen is something you back out of rather than close, and Cancel is
 * the dismissive label Apple's HIG names for exactly that, so a clean editor
 * says Cancel here where web says Close. Creating collapses into the same word,
 * which is why this takes no `isCreating`.
 */
export function getMobileEditorDismissLabel({
  hasUnsavedChanges,
}: {
  hasUnsavedChanges: boolean;
}): string {
  return hasUnsavedChanges ? EDITOR_ACTION_LABELS.discard : EDITOR_ACTION_LABELS.cancel;
}

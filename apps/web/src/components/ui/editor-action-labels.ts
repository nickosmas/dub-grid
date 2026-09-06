// One word, one meaning. `getEditorDismissLabel` below is the standing
// exception and is on its way out: a dismiss button that relabels itself as the
// user types is a moving target, so a click aimed at the safe word can land on
// the destructive one. Don't add callers.
export const EDITOR_ACTION_LABELS = {
  save: "Save",
  /**
   * Throw away unsaved changes. The save bar on an inline settings section, and
   * the destructive button in the unsaved-changes dialog - both mean the same
   * thing, so they share the word. Shopify's contextual save bar names this
   * button the same way.
   */
  discard: "Discard",
  /** Back out of a closeable surface. Confirms first when there is work to lose. */
  cancel: "Cancel",
  /** Leave a read-only surface, where there is no Save to cancel. */
  close: "Close",
} as const;

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

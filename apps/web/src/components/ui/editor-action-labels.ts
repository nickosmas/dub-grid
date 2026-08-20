export const EDITOR_ACTION_LABELS = {
  save: "Save",
  /** What the save button says while the save is in flight, beside its spinner. */
  saving: "Saving",
  cancel: "Cancel",
  discard: "Discard",
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

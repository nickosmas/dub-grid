export const EDITOR_ACTION_LABELS = {
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  discard: "Discard",
  close: "Close",
} as const;

export function getEditorSaveLabel(isSaving: boolean): string {
  return isSaving ? EDITOR_ACTION_LABELS.saving : EDITOR_ACTION_LABELS.save;
}

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

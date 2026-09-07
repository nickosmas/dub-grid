"use client";

import ConfirmDialog from "@/components/ConfirmDialog";

interface UnsavedChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({ onKeepEditing, onDiscard }: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      title="Unsaved changes"
      message="You have unsaved changes. Are you sure you want to discard them?"
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      variant="danger"
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  );
}

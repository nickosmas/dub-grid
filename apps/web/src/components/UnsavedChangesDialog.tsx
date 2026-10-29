"use client";

import ConfirmDialog from "@/components/ConfirmDialog";

interface UnsavedChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({ onKeepEditing, onDiscard }: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      title="Discard your changes?"
      message="You haven't saved what you changed here."
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      variant="danger"
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  );
}

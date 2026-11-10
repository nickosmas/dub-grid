"use client";

import ConfirmDialog from "@/components/ConfirmDialog";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { Undo2 } from "lucide-react";

/**
 * Saves whatever a surface holds and reports whether it worked. On `false` the
 * surface has already shown its own error, so the dialog closes and nobody
 * leaves.
 */
export type UnsavedChangesSave = () => boolean | Promise<boolean>;

interface UnsavedChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
  /** Offered only when the surface can save right now; otherwise two choices. */
  onSave?: () => void | Promise<unknown>;
}

/**
 * Asked before unsaved work is left behind. Discarding unsaved edits isn't
 * destructive under the button rules, so nothing here is red: Save is the one
 * filled button when it is offered, and Discard is otherwise.
 */
export function UnsavedChangesDialog({
  onKeepEditing,
  onDiscard,
  onSave,
}: UnsavedChangesDialogProps) {
  if (onSave) {
    return (
      <ConfirmDialog
        icon={Undo2}
        title="Save your changes?"
        message="You haven't saved what you changed here."
        cancelLabel="Keep editing"
        secondaryConfirmLabel={EDITOR_ACTION_LABELS.discard}
        secondaryConfirmTone="neutral"
        onSecondaryConfirm={onDiscard}
        confirmLabel={EDITOR_ACTION_LABELS.save}
        variant="info"
        onCancel={onKeepEditing}
        onConfirm={onSave}
      />
    );
  }
  return (
    <ConfirmDialog
      icon={Undo2}
      title="Discard your changes?"
      message="You haven't saved what you changed here."
      cancelLabel="Keep editing"
      confirmLabel={EDITOR_ACTION_LABELS.discard}
      variant="info"
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  );
}

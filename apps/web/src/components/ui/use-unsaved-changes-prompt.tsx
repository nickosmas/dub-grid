"use client";

import { useCallback, useState } from "react";
import { UnsavedChangesDialog, type UnsavedChangesSave } from "@/components/UnsavedChangesDialog";

interface UseUnsavedChangesPromptOptions {
  hasUnsavedChanges: boolean;
  /** Throw the edits away and leave. */
  onDiscard: () => void;
  /**
   * The surface's own save, offered as Save in the prompt. Leave it out while
   * the form can't be saved (invalid, or nothing to save it with), and the
   * prompt offers Discard and Keep editing only.
   */
  onSave?: UnsavedChangesSave;
  /** Runs after a Save from the prompt succeeds, for a save that doesn't already close the surface. */
  onSaved?: () => void;
}

export function useUnsavedChangesPrompt({
  hasUnsavedChanges,
  onDiscard,
  onSave,
  onSaved,
}: UseUnsavedChangesPromptOptions) {
  const [showPrompt, setShowPrompt] = useState(false);

  const keepEditing = useCallback(() => {
    setShowPrompt(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    setShowPrompt(false);
    onDiscard();
  }, [onDiscard]);

  const confirmSave = useCallback(async () => {
    if (!onSave) return;
    const saved = await onSave();
    setShowPrompt(false);
    if (saved) onSaved?.();
  }, [onSave, onSaved]);

  const requestClose = useCallback(() => {
    if (!hasUnsavedChanges) return true;
    setShowPrompt(true);
    return false;
  }, [hasUnsavedChanges]);

  return {
    requestClose,
    unsavedChangesDialog: showPrompt ? (
      <UnsavedChangesDialog
        onKeepEditing={keepEditing}
        onDiscard={confirmDiscard}
        onSave={onSave ? confirmSave : undefined}
      />
    ) : null,
  };
}

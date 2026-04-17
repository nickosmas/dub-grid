"use client";

import { useCallback, useState } from "react";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";

interface UseUnsavedChangesPromptOptions {
  hasUnsavedChanges: boolean;
  onDiscard: () => void;
}

export function useUnsavedChangesPrompt({
  hasUnsavedChanges,
  onDiscard,
}: UseUnsavedChangesPromptOptions) {
  const [showPrompt, setShowPrompt] = useState(false);

  const keepEditing = useCallback(() => {
    setShowPrompt(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    setShowPrompt(false);
    onDiscard();
  }, [onDiscard]);

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
      />
    ) : null,
  };
}

"use client";

import { Button } from "@/components/Button";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";

interface UnsavedChangesBarProps {
  saveDisabled?: boolean;
  saving?: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

/** Stays in view at the foot of a page that edits in place, once there's something to save. */
export function UnsavedChangesBar({
  saveDisabled = false,
  saving = false,
  onDiscard,
  onSave,
}: UnsavedChangesBarProps) {
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--dg-radius-lg)] border border-[var(--dg-color-border)] bg-[var(--dg-color-surface)] py-2.5 pl-4 pr-3 shadow-lg"
    >
      <span className="text-[14px] font-medium text-[var(--dg-color-text-primary)]">
        Unsaved changes
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-sm"
          disabled={saving}
          onClick={onDiscard}
        >
          {EDITOR_ACTION_LABELS.discard}
        </Button>
        <Button
          type="button"
          className="dg-btn dg-btn-primary dg-btn-sm"
          disabled={saveDisabled || saving}
          onClick={onSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

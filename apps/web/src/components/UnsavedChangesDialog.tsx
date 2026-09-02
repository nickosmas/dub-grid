"use client";

import Modal from "@/components/Modal";
import { Button } from "@/components/Button";

interface UnsavedChangesDialogProps {
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({ onKeepEditing, onDiscard }: UnsavedChangesDialogProps) {
  const descId = "unsaved-changes-dialog-description";

  return (
    <Modal
      title="Unsaved changes"
      onClose={onKeepEditing}
      showCloseButton={false}
      style={{ maxWidth: 460 }}
      aria-describedby={descId}
    >
      <div
        id={descId}
        style={{
          fontSize: "var(--dg-fs-body)",
          color: "var(--dg-color-text-secondary)",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        You have unsaved changes. Are you sure you want to discard them?
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button className="dg-btn dg-btn-secondary" onClick={onKeepEditing}>
          Keep editing
        </Button>
        <Button className="dg-btn dg-btn-danger" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </Modal>
  );
}

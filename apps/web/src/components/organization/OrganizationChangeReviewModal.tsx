"use client";

import type { OrganizationSettingsChange } from "@/lib/organization-settings";
import ChangeReviewModal from "@/components/review/ChangeReviewModal";

interface OrganizationChangeReviewModalProps {
  changes: OrganizationSettingsChange[];
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function OrganizationChangeReviewModal({
  changes,
  saving = false,
  onCancel,
  onConfirm,
}: OrganizationChangeReviewModalProps) {
  return (
    <ChangeReviewModal
      title="Review Organization Changes"
      description="Review these organization changes before saving. Sensitive updates should be confirmed carefully because they affect the whole workspace."
      changes={changes}
      saving={saving}
      confirmLabel="Confirm Save"
      warningText="This save includes sensitive organization changes."
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

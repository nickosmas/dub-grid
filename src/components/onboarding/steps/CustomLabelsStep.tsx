"use client";

import StepLayout from "../StepLayout";
import OrganizationLabels from "@/components/settings/OrganizationLabels";
import { useOrganizationData } from "@/hooks";

interface CustomLabelsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function CustomLabelsStep({ onNext, onBack }: CustomLabelsStepProps) {
  const { org, setOrg } = useOrganizationData();

  if (!org) return null;

  return (
    <StepLayout
      title="Custom Labels"
      description="Customize the terminology used throughout your workspace. For example, rename 'Focus Areas' to 'Wings' or 'Units'. These labels appear everywhere in the app."
      onNext={onNext}
      onBack={onBack}
    >
      <div
        style={{
          background: "var(--color-bg-card, white)",
          borderRadius: "var(--dg-radius-xl)",
          border: "1px solid var(--color-border)",
          padding: "24px",
        }}
      >
        <OrganizationLabels organization={org} onSave={setOrg} />
      </div>
    </StepLayout>
  );
}

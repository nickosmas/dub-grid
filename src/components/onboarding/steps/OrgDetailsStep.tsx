"use client";

import StepLayout from "../StepLayout";
import OrganizationGeneral from "@/components/settings/OrganizationGeneral";
import { useOrganizationData } from "@/hooks";

interface OrgDetailsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function OrgDetailsStep({ onNext, onBack }: OrgDetailsStepProps) {
  const { org, setOrg } = useOrganizationData();

  if (!org) return null;

  return (
    <StepLayout
      title="Organization Details"
      description="Confirm your facility's name, location, and timezone. You can always update these later in Settings."
      onNext={onNext}
      onBack={onBack}
      wide
    >
      <div
        style={{
          background: "var(--color-bg-card, white)",
          borderRadius: "var(--dg-radius-xl)",
          border: "1px solid var(--color-border)",
          padding: "24px",
        }}
      >
        <OrganizationGeneral organization={org} onSave={setOrg} />
      </div>
    </StepLayout>
  );
}

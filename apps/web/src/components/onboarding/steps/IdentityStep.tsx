"use client";

import StepLayout from "../StepLayout";
import CompositeSection from "./CompositeSection";
import OrganizationGeneral from "@/components/settings/OrganizationGeneral";
import OrganizationLabels from "@/components/settings/OrganizationLabels";
import { useOrganizationData } from "@/hooks";

interface IdentityStepProps {
  onNext: () => void;
  onBack?: () => void;
}

/**
 * Identity = organization details + custom labels in one screen.
 * Replaces the standalone OrgDetailsStep and CustomLabelsStep.
 */
export default function IdentityStep({ onNext, onBack }: IdentityStepProps) {
  const { org, setOrg } = useOrganizationData();

  if (!org) return null;

  return (
    <StepLayout
      title="Identity"
      description="Name your workspace and tailor the words your team will see throughout the app. You can edit any of this later in Settings."
      onNext={onNext}
      onBack={onBack}
      showBack={!!onBack}
      wide
    >
      <CompositeSection
        title="Organization details"
        description="Facility name, location, and timezone."
      >
        <OrganizationGeneral organization={org} onSave={setOrg} />
      </CompositeSection>

      <CompositeSection
        title="Terminology"
        description="Rename labels like 'Focus Areas' to 'Wings' or 'Units'. These names appear everywhere in the app."
      >
        <OrganizationLabels organization={org} onSave={setOrg} />
      </CompositeSection>
    </StepLayout>
  );
}

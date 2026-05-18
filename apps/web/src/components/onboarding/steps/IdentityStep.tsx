"use client";

import { useCallback, useState } from "react";
import StepLayout from "../StepLayout";
import CompositeSection from "./CompositeSection";
import OrganizationGeneral from "@/components/settings/OrganizationGeneral";
import OrganizationLabels from "@/components/settings/OrganizationLabels";
import { useOrganizationData } from "@/hooks";
import { useWizardEditorCollector } from "../WizardModeContext";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

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
  const { Provider, saveAll, hasAnyErrors } = useWizardEditorCollector();
  const [saving, setSaving] = useState(false);

  const handleNext = useCallback(async () => {
    if (hasAnyErrors()) {
      toast.error("Fix the highlighted errors before continuing.");
      return;
    }
    setSaving(true);
    try {
      await saveAll();
      onNext();
    } catch (err) {
      Sentry.captureException(err);
      toast.error("We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [hasAnyErrors, onNext, saveAll]);

  if (!org) return null;

  return (
    <StepLayout
      title="Identity"
      description="Name your workspace and tailor the words your team will see throughout the app. You can edit any of this later in Settings."
      onNext={handleNext}
      onBack={onBack}
      showBack={!!onBack}
      nextLoading={saving}
      nextDisabled={saving}
      wide
    >
      <Provider>
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
      </Provider>
    </StepLayout>
  );
}

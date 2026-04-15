"use client";

import { useRef } from "react";
import StepLayout from "../StepLayout";
import StringListSettings from "@/components/settings/StringListSettings";
import { useOrganizationData } from "@/hooks";
import { saveCertifications, checkCertificationDependencies } from "@/lib/db";
import type { NamedItem } from "@/types";

interface CertificationsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function CertificationsStep({
  onNext,
  onBack,
}: CertificationsStepProps) {
  const { org, certifications, handleCertificationsChange } =
    useOrganizationData();
  const existingRef = useRef<NamedItem[]>(certifications);

  if (!org) return null;

  const label = org.certificationLabel || "Certifications";
  const hasCerts = certifications.length > 0;

  return (
    <StepLayout
      title={label}
      description={`Add the skill levels or certifications your staff hold. These help ensure the right qualifications are scheduled for each shift.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasCerts}
      wide
    >
      <StringListSettings
        label={label}
        items={certifications}
        onSave={async (updated) => {
          const saved = await saveCertifications(org.id, updated, existingRef.current);
          existingRef.current = saved;
          handleCertificationsChange(saved);
        }}
        placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}...`}
        canEdit={true}
        initialEditing
        hideAbbr
        onCheckDependencies={(id) => checkCertificationDependencies(id, org.id)}
      />
      {!hasCerts && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one {label.toLowerCase().replace(/s$/, "")} to continue.
        </p>
      )}
    </StepLayout>
  );
}

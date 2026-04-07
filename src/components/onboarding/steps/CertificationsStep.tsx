"use client";

import { useRef } from "react";
import StepLayout from "../StepLayout";
import StringListSettings from "@/components/settings/StringListSettings";
import { useOrganizationData } from "@/hooks";
import { saveCertifications } from "@/lib/db";
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
      <div
        style={{
          background: "var(--color-bg-card, white)",
          borderRadius: 16,
          border: "1px solid var(--color-border)",
          padding: "20px",
        }}
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
          hideAbbr
        />
      </div>
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

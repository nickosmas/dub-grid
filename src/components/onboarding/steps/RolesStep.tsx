"use client";

import { useRef } from "react";
import StepLayout from "../StepLayout";
import StringListSettings from "@/components/settings/StringListSettings";
import { useOrganizationData } from "@/hooks";
import { saveOrganizationRoles } from "@/lib/db";
import type { NamedItem } from "@/types";

interface RolesStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function RolesStep({ onNext, onBack }: RolesStepProps) {
  const { org, orgRoles, setOrgRoles, departments } = useOrganizationData();
  const existingRef = useRef<NamedItem[]>(orgRoles);

  if (!org) return null;

  const label = org.roleLabel || "Roles";
  const hasRoles = orgRoles.length > 0;

  return (
    <StepLayout
      title={label}
      description={`Define the job positions in your facility (e.g., RN, LPN, CNA, Charge Nurse). These are assigned to employees and help organize your schedule.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasRoles}
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
          items={orgRoles}
          onSave={async (items) => {
            const saved = await saveOrganizationRoles(org.id, items, existingRef.current);
            existingRef.current = saved;
            setOrgRoles(saved);
          }}
          placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}...`}
          canEdit={true}
          departments={departments}
        />
      </div>
      {!hasRoles && (
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

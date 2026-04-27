"use client";

import { useRef } from "react";
import StepLayout from "../StepLayout";
import StringListSettings from "@/components/settings/StringListSettings";
import { useOrganizationData } from "@/hooks";
import { saveOrganizationRoles, checkRoleDependencies } from "@/lib/db";
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
      description={`Define the roles people can carry in your facility. Mark the roles that should affect scheduling as schedule-eligible, and leave cosmetic titles like Director visible without letting them gate jobs.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasRoles}
      wide
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
        initialEditing
        departments={departments}
        showScheduleRoleToggle
        onCheckDependencies={(id) => checkRoleDependencies(id, org.id)}
      />
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

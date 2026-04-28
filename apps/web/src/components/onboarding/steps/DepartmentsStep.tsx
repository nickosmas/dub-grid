"use client";

import StepLayout from "../StepLayout";
import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import { useOrganizationData } from "@/hooks";

interface DepartmentsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function DepartmentsStep({ onNext, onBack }: DepartmentsStepProps) {
  const { org, departments, focusAreas, setDepartments, setFocusAreas } =
    useOrganizationData();

  if (!org) return null;

  const hasDepartments = departments.length > 0;

  return (
    <StepLayout
      title={`${org.departmentLabel || "Scheduled Departments"} & ${org.focusAreaLabel || "Focus Areas"}`}
      description={`Create your organizational structure. ${(org.departmentLabel || "scheduled departments").toLowerCase()} appear on the schedule grid and contain ${(org.focusAreaLabel || "focus areas").toLowerCase()}. Management departments are for non-schedule staff like HR or admin.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasDepartments}
      wide
    >
      <DepartmentsSettings
        departments={departments}
        focusAreas={focusAreas}
        orgId={org.id}
        focusAreaLabel={org.focusAreaLabel || "Focus Areas"}
        departmentLabel={org.departmentLabel || "Scheduled Departments"}
        canManageFocusAreas={true}
        canManageOrgLabels={true}
        onDepartmentsChange={setDepartments}
        onFocusAreasChange={setFocusAreas}
      />
      {!hasDepartments && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one scheduled department to continue.
        </p>
      )}
    </StepLayout>
  );
}

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
      title={`${org.departmentLabel || "Departments"} & ${org.focusAreaLabel || "Focus Areas"}`}
      description={`Create your organizational structure. Scheduled ${(org.departmentLabel || "departments").toLowerCase()} appear on the schedule grid and contain ${(org.focusAreaLabel || "focus areas").toLowerCase()}. Management ${(org.departmentLabel || "departments").toLowerCase()} are for non-schedule staff like HR or admin.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasDepartments}
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
        <DepartmentsSettings
          departments={departments}
          focusAreas={focusAreas}
          orgId={org.id}
          focusAreaLabel={org.focusAreaLabel || "Focus Areas"}
          departmentLabel={org.departmentLabel || "Departments"}
          canManageFocusAreas={true}
          canManageOrgLabels={true}
          onDepartmentsChange={setDepartments}
          onFocusAreasChange={setFocusAreas}
        />
      </div>
      {!hasDepartments && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one department to continue.
        </p>
      )}
    </StepLayout>
  );
}

"use client";

import StepLayout from "../StepLayout";
import ShiftCategoriesSettings from "@/components/settings/ShiftCategories";
import { useOrganizationData } from "@/hooks";

interface ShiftsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ShiftsStep({ onNext, onBack }: ShiftsStepProps) {
  const {
    org,
    shiftCategories,
    focusAreas,
    setShiftCategories,
  } = useOrganizationData({ includeAssignmentDefinitionCompatibility: false });

  if (!org) return null;

  const hasCategories = shiftCategories.length > 0;

  return (
    <StepLayout
      title="Shifts"
      description="Define your core shift blocks per focus area. Shifts capture shared timing and visual language like Day, Evening, and Night."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasCategories}
      wide
    >
      <div
        style={{
          background: "var(--color-bg-card, white)",
          borderRadius: "var(--dg-radius-xl)",
          border: "1px solid var(--color-border)",
          padding: "20px",
        }}
      >
        <ShiftCategoriesSettings
          shiftCategories={shiftCategories}
          focusAreas={focusAreas}
          orgId={org.id}
          onChange={setShiftCategories}
          canManageScheduleDefinitions={true}
        />
      </div>
      {!hasCategories && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one shift to continue.
        </p>
      )}
    </StepLayout>
  );
}

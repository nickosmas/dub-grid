"use client";

import StepLayout from "../StepLayout";
import ShiftCategoriesSettings from "@/components/settings/ShiftCategories";
import { useOrganizationData } from "@/hooks";

interface ShiftCodesStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ShiftCodesStep({ onNext, onBack }: ShiftCodesStepProps) {
  const {
    org,
    shiftCategories,
    focusAreas,
    shiftCodes,
    setShiftCategories,
    handleShiftCodesChange,
  } = useOrganizationData();

  if (!org) return null;

  const hasShiftCodes = shiftCodes.length > 0;

  return (
    <StepLayout
      title="Shift Codes"
      description="Define the types of shifts your staff work (e.g., Day, Evening, Night). Shift codes are organized into categories per focus area and define start/end times."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasShiftCodes}
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
        <ShiftCategoriesSettings
          shiftCategories={shiftCategories}
          focusAreas={focusAreas}
          orgId={org.id}
          onChange={setShiftCategories}
          canManageShiftCodes={true}
          shiftCodes={shiftCodes}
          onShiftCodesChange={handleShiftCodesChange}
        />
      </div>
      {!hasShiftCodes && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one shift code to continue.
        </p>
      )}
    </StepLayout>
  );
}

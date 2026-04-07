"use client";

import StepLayout from "../StepLayout";
import ShiftCodesSettings from "@/components/settings/ShiftCodes";
import { useOrganizationData } from "@/hooks";

interface ShiftCodesDetailStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ShiftCodesDetailStep({
  onNext,
  onBack,
}: ShiftCodesDetailStepProps) {
  const {
    org,
    shiftCodes,
    shiftCategories,
    focusAreas,
    certifications,
    absenceTypes,
    handleShiftCodesChange,
    handleAbsenceTypesChange,
  } = useOrganizationData();

  if (!org) return null;

  const hasShiftCodes = shiftCodes.length > 0;
  const isNameMode = org.shiftDisplayMode === "name";

  return (
    <StepLayout
      title={isNameMode ? "Shift Names" : "Shift Codes"}
      description={isNameMode
        ? "Configure individual shifts within your categories. Set names, colors, and time windows for each shift."
        : "Configure individual shifts within your categories. Set labels, names, colors, and time windows for each shift."
      }
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
        <ShiftCodesSettings
          shiftCodes={shiftCodes}
          focusAreas={focusAreas}
          shiftCategories={shiftCategories}
          orgId={org.id}
          certifications={certifications}
          certificationLabel={org.certificationLabel || "Certifications"}
          focusAreaLabel={org.focusAreaLabel || "Focus Areas"}
          onChange={handleShiftCodesChange}
          canManageShiftCodes={true}
          absenceTypes={absenceTypes}
          onAbsenceTypesChange={handleAbsenceTypesChange}
          shiftDisplayMode={org.shiftDisplayMode}
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

"use client";

import StepLayout from "../StepLayout";
import JobsSettings from "@/components/settings/Jobs";
import { useOrganizationData } from "@/hooks";

interface JobsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function JobsStep({
  onNext,
  onBack,
}: JobsStepProps) {
  const {
    org,
    jobs,
    orgRoles,
    certifications,
    departments,
    focusAreas,
    shiftCategories,
    setJobs,
  } = useOrganizationData({ includeAssignmentDefinitionCompatibility: false });

  if (!org) return null;

  const hasVisibleJobs = jobs.length > 0;

  return (
    <StepLayout
      title="Jobs"
      description="Define responsibilities like Supervisor, Mentor, Nurse, and Office, then place each scheduled job on the departments, focus areas, and shifts where it should appear."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasVisibleJobs}
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
        <JobsSettings
          jobs={jobs}
          orgId={org.id}
          orgRoles={orgRoles}
          certifications={certifications}
          departments={departments}
          focusAreas={focusAreas}
          shiftCategories={shiftCategories}
          roleLabel={org.roleLabel || "Roles"}
          certificationLabel={org.certificationLabel || "Certifications"}
          onChange={setJobs}
          canManageScheduleDefinitions={true}
          shiftDisplayMode={org.shiftDisplayMode}
        />
      </div>
      {!hasVisibleJobs && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one visible job to continue.
        </p>
      )}
    </StepLayout>
  );
}

"use client";

import { useRef } from "react";
import StepLayout from "../StepLayout";
import CompositeSection from "./CompositeSection";
import DepartmentsSettings from "@/components/settings/DepartmentsSettings";
import StringListSettings from "@/components/settings/StringListSettings";
import { useOrganizationData } from "@/hooks";
import {
  checkCertificationDependencies,
  checkRoleDependencies,
  saveCertifications,
  saveOrganizationRoles,
} from "@/features/settings/client";
import type { NamedItem } from "@/types";

interface StructureStepProps {
  onNext: () => void;
  onBack: () => void;
}

/**
 * Structure = departments + focus areas, roles, certifications, all on
 * one screen. Replaces DepartmentsStep, RolesStep, CertificationsStep.
 *
 * Gating: requires at least one department (focus areas, roles, and certs
 * still have inline warnings but don't block forward navigation — they
 * have sensible empty defaults and admins commonly want to grow them
 * over time).
 */
export default function StructureStep({ onNext, onBack }: StructureStepProps) {
  const {
    org,
    departments,
    focusAreas,
    orgRoles,
    certifications,
    setDepartments,
    setFocusAreas,
    setOrgRoles,
    handleCertificationsChange,
  } = useOrganizationData();

  const rolesRef = useRef<NamedItem[]>(orgRoles);
  const certsRef = useRef<NamedItem[]>(certifications);

  if (!org) return null;

  const roleLabel = org.roleLabel || "Roles";
  const certLabel = org.certificationLabel || "Certifications";
  const deptLabel = org.departmentLabel || "Departments";
  const focusLabel = org.focusAreaLabel || "Focus Areas";
  const hasDepartments = departments.length > 0;

  return (
    <StepLayout
      title="Structure"
      description={`Set up your ${deptLabel.toLowerCase()}, the ${roleLabel.toLowerCase()} people carry, and the ${certLabel.toLowerCase()} that gate scheduling decisions.`}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!hasDepartments}
      wide
    >
      <CompositeSection
        title={`${deptLabel} & ${focusLabel}`}
        description={`${deptLabel} appear on the schedule grid. ${focusLabel} live inside them. Management departments are for non-schedule staff like HR or admin.`}
      >
        <DepartmentsSettings
          departments={departments}
          focusAreas={focusAreas}
          orgId={org.id}
          focusAreaLabel={focusLabel}
          departmentLabel={deptLabel}
          canManageFocusAreas={true}
          canManageOrgLabels={true}
          onDepartmentsChange={setDepartments}
          onFocusAreasChange={setFocusAreas}
        />
      </CompositeSection>

      <CompositeSection
        title={roleLabel}
        description={`Decide which roles are schedule-eligible. Schedule-eligible roles can gate jobs; any others stay as visible titles. You control which is which.`}
      >
        <StringListSettings
          label={roleLabel}
          items={orgRoles}
          onSave={async (items) => {
            const saved = await saveOrganizationRoles(org.id, items, rolesRef.current);
            rolesRef.current = saved;
            setOrgRoles(saved);
          }}
          placeholder={`Add a ${roleLabel.toLowerCase().replace(/s$/, "")}...`}
          canEdit={true}
          initialEditing
          departments={departments}
          showScheduleRoleToggle
          onCheckDependencies={(id) => checkRoleDependencies(id, org.id)}
        />
      </CompositeSection>

      <CompositeSection
        title={certLabel}
        description="Skill levels or certifications your staff hold. These help ensure the right qualifications are scheduled for each shift."
      >
        <StringListSettings
          label={certLabel}
          items={certifications}
          onSave={async (updated) => {
            const saved = await saveCertifications(org.id, updated, certsRef.current);
            certsRef.current = saved;
            handleCertificationsChange(saved);
          }}
          placeholder={`Add a ${certLabel.toLowerCase().replace(/s$/, "")}...`}
          canEdit={true}
          initialEditing
          hideAbbr
          onCheckDependencies={(id) => checkCertificationDependencies(id, org.id)}
        />
      </CompositeSection>

      {!hasDepartments && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-warning-text)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Add at least one {deptLabel.toLowerCase().replace(/s$/, "")} to continue.
        </p>
      )}
    </StepLayout>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
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
import { useWizardEditorCollector } from "../WizardModeContext";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";

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
  const { Provider, saveAll, hasAnyErrors } = useWizardEditorCollector();
  const [saving, setSaving] = useState(false);

  // Mirror departments into a ref so handleNext can read the latest value
  // *after* saveAll resolves (the prop captured at click time is stale by then).
  const departmentsRef = useRef(departments);
  departmentsRef.current = departments;

  const hasDepartments = departments.length > 0;

  const handleNext = useCallback(async () => {
    if (hasAnyErrors()) {
      toast.error("Fix the highlighted errors before continuing.");
      return;
    }
    setSaving(true);
    try {
      await saveAll();
      // Re-check the requirement against the post-save state. In wizard mode
      // the nested editor's only save trigger IS this Continue button, so we
      // must allow the click even when departments.length === 0 at render
      // time and instead validate after the save runs.
      if (departmentsRef.current.length === 0) {
        toast.error(`Add at least one ${(org?.departmentLabel || "department").toLowerCase().replace(/s$/, "")} to continue.`);
        return;
      }
      onNext();
    } catch (err) {
      Sentry.captureException(err);
      toast.error("We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [hasAnyErrors, onNext, org?.departmentLabel, saveAll]);

  if (!org) return null;

  const roleLabel = org.roleLabel || "Roles";
  const certLabel = org.certificationLabel || "Certifications";
  const deptLabel = org.departmentLabel || "Departments";
  const focusLabel = org.focusAreaLabel || "Focus Areas";

  return (
    <StepLayout
      title="Structure"
      description={`Set up your ${deptLabel.toLowerCase()}, the ${roleLabel.toLowerCase()} people carry, and the ${certLabel.toLowerCase()} that gate scheduling decisions.`}
      onNext={handleNext}
      onBack={onBack}
      nextDisabled={!hasDepartments || saving}
      nextLoading={saving}
      wide
    >
      <Provider>
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
            onSave={async (items, hardDeleteIds) => {
              const saved = await saveOrganizationRoles(
                org.id,
                items,
                rolesRef.current,
                hardDeleteIds,
              );
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
            onSave={async (updated, hardDeleteIds) => {
              const saved = await saveCertifications(
                org.id,
                updated,
                certsRef.current,
                hardDeleteIds,
              );
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
      </Provider>

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

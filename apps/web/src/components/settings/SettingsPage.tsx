"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import {
  Organization,
  FocusArea,
  ShiftCategory,
  IndicatorType,
  NamedItem,
  Department,
  CoverageRequirement,
  AbsenceType,
  JobDefinition,
} from "@/types";
import {
  checkCertificationDependencies,
  checkRoleDependencies,
  saveCertifications,
  saveOrganizationRoles,
} from "@/features/settings/client";
import { toast } from "sonner";
import {
  type SectionId,
  resolveSection,
  buildNavGroups,
  getDefaultSection,
  getMaxWidth,
  type NavPermissions,
} from "./nav-config";
import dynamic from "next/dynamic";
import { SettingsShell } from "./SettingsShell";

// Each section is loaded when its tab is opened, not when Settings mounts.
//
// Exactly one of these renders at a time — the JSX below is a chain of
// `activeSection === "..."` guards — but importing them statically meant
// opening any single section downloaded all fourteen, over 11k lines, most of
// which the reader never looks at in that visit.
//
// ssr: false matches the treatment ShiftEditPanel and the print views already
// get: these are authenticated, force-dynamic screens, so nothing is gained by
// rendering them on the server first.
const OrganizationGeneral = dynamic(() => import("./OrganizationGeneral"), { ssr: false });
const OrganizationLabels = dynamic(() => import("./OrganizationLabels"), { ssr: false });
const BillingSettings = dynamic(() => import("./BillingSettings"), { ssr: false });
const DisplayMode = dynamic(() => import("./DisplayMode"), { ssr: false });
const ScheduleRules = dynamic(() => import("./ScheduleRules"), { ssr: false });
const ShiftCategories = dynamic(() => import("./ShiftCategories"), { ssr: false });
const Jobs = dynamic(() => import("./Jobs"), { ssr: false });
const AbsenceTypes = dynamic(() => import("./AbsenceTypes"), { ssr: false });
const Coverage = dynamic(() => import("./Coverage"), { ssr: false });
const StringListSettings = dynamic(() => import("./StringListSettings"), { ssr: false });
const DepartmentsSettings = dynamic(() => import("./DepartmentsSettings"), { ssr: false });
const Indicators = dynamic(() => import("./Indicators"), { ssr: false });
const OrgActivityLog = dynamic(() => import("./ActivityLog"), { ssr: false });
const DangerZone = dynamic(() => import("./DangerZone"), { ssr: false });

// ── Props ────────────────────────────────────────────────────────────────────
export interface SettingsPageProps {
  organization: Organization;
  focusAreas: FocusArea[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  indicatorTypes: IndicatorType[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  departments: Department[];
  onOrganizationSave: (organization: Organization) => void;
  onFocusAreasChange: (focusAreas: FocusArea[]) => void;
  onShiftCategoriesChange: (categories: ShiftCategory[]) => void;
  onJobsChange: (jobs: JobDefinition[]) => void;
  onIndicatorTypesChange: (types: IndicatorType[]) => void;
  onCertificationsChange: (items: NamedItem[]) => void;
  onOrgRolesChange: (items: NamedItem[]) => void;
  onDepartmentsChange: (items: Department[]) => void;
  canManageOrg: boolean;
  canAccessSettings: boolean;
  isSuperAdmin: boolean;
  isGridmaster: boolean;
  canManageOrgLabels: boolean;
  canViewOrgLabels: boolean;
  canManageFocusAreas: boolean;
  canViewFocusAreas: boolean;
  canManageScheduleDefinitions: boolean;
  canViewScheduleDefinitions: boolean;
  canManageIndicatorTypes: boolean;
  canViewIndicatorTypes: boolean;
  canManageOrgSettings: boolean;
  coverageRequirements: CoverageRequirement[];
  onCoverageRequirementsChange: (reqs: CoverageRequirement[]) => void;
  canManageCoverageRequirements: boolean;
  canViewCoverageRequirements: boolean;
  absenceTypes: AbsenceType[];
  onAbsenceTypesChange: (types: AbsenceType[]) => void;
}

// "danger" pins to the sidebar footer (above the collapse button)
// rather than scrolling with the rest of the nav.
const FOOTER_GROUP_IDS = ["danger"];

// ── Main Component ───────────────────────────────────────────────────────────
export default function SettingsPage({
  organization,
  focusAreas,
  shiftCategories,
  jobs,
  indicatorTypes,
  certifications,
  orgRoles,
  departments,
  onOrganizationSave,
  onFocusAreasChange,
  onShiftCategoriesChange,
  onJobsChange,
  onIndicatorTypesChange,
  onCertificationsChange,
  onOrgRolesChange,
  onDepartmentsChange,
  canManageOrg,
  canAccessSettings,
  isSuperAdmin,
  isGridmaster,
  canManageOrgLabels,
  canViewOrgLabels,
  canManageFocusAreas,
  canViewFocusAreas,
  canManageScheduleDefinitions,
  canViewScheduleDefinitions,
  canManageIndicatorTypes,
  canViewIndicatorTypes,
  canManageOrgSettings,
  coverageRequirements,
  onCoverageRequirementsChange,
  canManageCoverageRequirements,
  canViewCoverageRequirements,
  absenceTypes,
  onAbsenceTypesChange,
}: SettingsPageProps) {
  const searchParams = useSearchParams();

  const perms: NavPermissions = useMemo(
    () => ({
      canManageOrg,
      canAccessSettings,
      isSuperAdmin,
      isGridmaster,
      canManageOrgLabels,
      canViewOrgLabels,
      canManageFocusAreas,
      canViewFocusAreas,
      canManageScheduleDefinitions,
      canViewScheduleDefinitions,
      canManageIndicatorTypes,
      canViewIndicatorTypes,
      canManageOrgSettings,
      canManageCoverageRequirements,
      canViewCoverageRequirements,
    }),
    [
      canManageOrg,
      canAccessSettings,
      isSuperAdmin,
      isGridmaster,
      canManageOrgLabels,
      canViewOrgLabels,
      canManageFocusAreas,
      canViewFocusAreas,
      canManageScheduleDefinitions,
      canViewScheduleDefinitions,
      canManageIndicatorTypes,
      canViewIndicatorTypes,
      canManageOrgSettings,
      canManageCoverageRequirements,
      canViewCoverageRequirements,
    ],
  );

  const focusAreaLabel = organization.focusAreaLabel || "Focus Areas";
  const certificationLabel = organization.certificationLabel || "Certifications";
  const roleLabel = organization.roleLabel || "Roles";
  const scheduledDepartmentLabel = "Scheduled Departments";
  const navGroups = useMemo(
    () =>
      buildNavGroups(perms, {
        focusAreaLabel,
        certificationLabel,
        roleLabel,
      }),
    [perms, focusAreaLabel, certificationLabel, roleLabel],
  );

  const allItems = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);
  const defaultSection = getDefaultSection(perms);
  const sectionFromPath = resolveSection(searchParams.get("section"));
  const billingReturnSection =
    !sectionFromPath && searchParams.get("billing") ? "org-billing" : null;
  const requestedSection = sectionFromPath ?? billingReturnSection;
  const activeSection: SectionId =
    requestedSection && allItems.some((i) => i.id === requestedSection)
      ? requestedSection
      : defaultSection;
  const maxWidth = getMaxWidth(activeSection);

  // Permission notice for view-only users.
  const banner =
    canAccessSettings && !isSuperAdmin && !isGridmaster ? (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "var(--color-info-bg)",
          borderRadius: "var(--dg-radius-sm)",
          border: "1px solid var(--color-info-border)",
          fontSize: "var(--dg-fs-caption)",
          color: "var(--color-info-text)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Some settings are read-only based on your permissions. Contact your super admin to request
        changes.
      </div>
    ) : null;

  return (
    <SettingsShell
      basePath="/settings"
      navGroups={navGroups}
      footerGroupIds={FOOTER_GROUP_IDS}
      defaultSection={defaultSection}
      activeSection={activeSection}
      maxWidth={maxWidth}
      banner={banner}
    >
      {/* ── General group ─────────────────────────────────────── */}

      {activeSection === "org-general" && isSuperAdmin && (
        <OrganizationGeneral organization={organization} onSave={onOrganizationSave} />
      )}

      {activeSection === "org-billing" && (isSuperAdmin || isGridmaster) && (
        <BillingSettings organization={organization} />
      )}

      {activeSection === "org-labels" &&
        (isSuperAdmin || canManageOrgLabels || canViewOrgLabels) && (
          <OrganizationLabels
            organization={organization}
            onSave={onOrganizationSave}
            readOnly={!isSuperAdmin && !canManageOrgLabels}
          />
        )}

      {activeSection === "org-activity" && isSuperAdmin && (
        <OrgActivityLog orgId={organization.id} />
      )}

      {activeSection === "org-display" && canManageOrgSettings && (
        <DisplayMode
          organization={organization}
          shiftCategories={shiftCategories}
          jobs={jobs}
          onSave={onOrganizationSave}
        />
      )}

      {/* ── Scheduling group ─────────────────────────────────── */}

      {activeSection === "schedule-rules" && isSuperAdmin && (
        <ScheduleRules organization={organization} onOrganizationSave={onOrganizationSave} />
      )}

      {activeSection === "schedule-shifts" &&
        (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <ShiftCategories
            shiftCategories={shiftCategories}
            focusAreas={focusAreas}
            orgId={organization.id}
            onChange={onShiftCategoriesChange}
            canManageScheduleDefinitions={canManageScheduleDefinitions}
          />
        )}

      {activeSection === "schedule-jobs" &&
        (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <Jobs
            jobs={jobs}
            orgId={organization.id}
            orgRoles={orgRoles}
            certifications={certifications}
            departments={departments}
            focusAreas={focusAreas}
            shiftCategories={shiftCategories}
            roleLabel={roleLabel}
            certificationLabel={certificationLabel}
            onChange={onJobsChange}
            canManageScheduleDefinitions={canManageScheduleDefinitions}
            organization={organization}
            onOrganizationSave={onOrganizationSave}
          />
        )}

      {activeSection === "schedule-absence-types" &&
        (canManageScheduleDefinitions || canViewScheduleDefinitions) && (
          <AbsenceTypes
            absenceTypes={absenceTypes}
            orgId={organization.id}
            onChange={onAbsenceTypesChange}
            canManageScheduleDefinitions={canManageScheduleDefinitions}
            shiftDisplayMode={organization.shiftDisplayMode}
          />
        )}

      {activeSection === "schedule-coverage" &&
        (canManageCoverageRequirements || canViewCoverageRequirements) && (
          <Coverage
            orgId={organization.id}
            focusAreas={focusAreas}
            shiftCategories={shiftCategories}
            jobs={jobs}
            orgRoles={orgRoles}
            certifications={certifications}
            coverageRequirements={coverageRequirements}
            onCoverageRequirementsChange={onCoverageRequirementsChange}
            canEdit={canManageCoverageRequirements}
            defaultShiftEnabled={organization.defaultShiftEnabled}
          />
        )}

      {/* ── Staff designations group ─────────────────────────── */}

      {activeSection === "staff-certifications" && (canManageOrgLabels || canViewOrgLabels) && (
        <StringListSettings
          label={certificationLabel}
          sectionTitle={certificationLabel}
          maxWidth={maxWidth}
          wideTable
          items={certifications}
          placeholder="e.g. RN"
          onSave={async (updated, hardDeleteIds) => {
            try {
              const saved = await saveCertifications(
                organization.id,
                updated,
                certifications,
                hardDeleteIds,
              );
              onCertificationsChange(saved);
              toast.success("Certifications saved");
            } catch (err) {
              toast.error("We couldn't save the certifications. Try again.");
              throw err;
            }
          }}
          canEdit={canManageOrgLabels}
          departments={departments}
          onCheckDependencies={(id) => checkCertificationDependencies(id, organization.id)}
        />
      )}

      {activeSection === "staff-roles" && (canManageOrgLabels || canViewOrgLabels) && (
        <StringListSettings
          label={roleLabel}
          sectionTitle={roleLabel}
          maxWidth={maxWidth}
          wideTable
          items={orgRoles}
          placeholder="e.g. Charge Nurse"
          onSave={async (updated, hardDeleteIds) => {
            try {
              const saved = await saveOrganizationRoles(
                organization.id,
                updated,
                orgRoles,
                hardDeleteIds,
              );
              onOrgRolesChange(saved);
              toast.success("Roles saved");
            } catch (err) {
              toast.error("We couldn't save the roles. Try again.");
              throw err;
            }
          }}
          canEdit={canManageOrgLabels}
          departments={departments}
          showScheduleRoleToggle
          scheduleEligibilityHelpText="Only schedule-eligible roles can limit jobs."
          onCheckDependencies={(id) => checkRoleDependencies(id, organization.id)}
        />
      )}

      {activeSection === "staff-departments" &&
        (canManageFocusAreas || canViewFocusAreas || canManageOrgLabels || canViewOrgLabels) && (
          <DepartmentsSettings
            departments={departments}
            focusAreas={focusAreas}
            orgId={organization.id}
            focusAreaLabel={focusAreaLabel}
            departmentLabel={scheduledDepartmentLabel}
            canManageFocusAreas={canManageFocusAreas}
            canManageOrgLabels={canManageOrgLabels}
            onDepartmentsChange={onDepartmentsChange}
            onFocusAreasChange={onFocusAreasChange}
          />
        )}

      {activeSection === "staff-indicators" &&
        (canManageIndicatorTypes || canViewIndicatorTypes) && (
          <Indicators
            indicatorTypes={indicatorTypes}
            orgId={organization.id}
            onChange={onIndicatorTypesChange}
            canManageIndicatorTypes={canManageIndicatorTypes}
          />
        )}

      {/* ── Danger Zone group ───────────────────────────────── */}

      {activeSection === "org-danger" && isSuperAdmin && <DangerZone organization={organization} />}
    </SettingsShell>
  );
}

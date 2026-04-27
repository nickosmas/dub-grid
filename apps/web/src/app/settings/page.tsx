"use client";

import SettingsPage from "@/components/settings/SettingsPage";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, usePermissions } from "@/hooks";

function SettingsPageContent() {
  const {
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
  } = usePermissions();
  const {
    org, focusAreas, absenceTypes, shiftCategories, jobs, indicatorTypes,
    certifications, orgRoles, departments, coverageRequirements, loading, loadError,
    setOrg, setFocusAreas, handleAbsenceTypesChange, setShiftCategories,
    setJobs, setIndicatorTypes, handleCertificationsChange, setOrgRoles, setDepartments, setCoverageRequirements,
  } = useOrganizationData({ includeAssignmentDefinitionCompatibility: false });
  const isLoading = loading || !org;

  if (loadError && !org) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <p style={{ color: "var(--color-text-muted)" }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--color-bg)",
        minHeight: "100vh",
        color: "var(--color-text-primary)",
      }}
    >
      <ProgressBar loading={isLoading} />

      {!isLoading && (
        <SettingsPage
          organization={org}
          focusAreas={focusAreas}
          shiftCategories={shiftCategories}
          jobs={jobs}
          indicatorTypes={indicatorTypes}
          certifications={certifications}
          orgRoles={orgRoles}
          departments={departments}
          onOrganizationSave={setOrg}
          onFocusAreasChange={setFocusAreas}
          onShiftCategoriesChange={setShiftCategories}
          onJobsChange={setJobs}
          onIndicatorTypesChange={setIndicatorTypes}
          onCertificationsChange={handleCertificationsChange}
          onOrgRolesChange={setOrgRoles}
          onDepartmentsChange={setDepartments}
          canManageOrg={canManageOrg}
          canAccessSettings={canAccessSettings}
          isSuperAdmin={isSuperAdmin}
          isGridmaster={isGridmaster}
          canManageOrgLabels={canManageOrgLabels}
          canViewOrgLabels={canViewOrgLabels}
          canManageFocusAreas={canManageFocusAreas}
          canViewFocusAreas={canViewFocusAreas}
          canManageScheduleDefinitions={canManageScheduleDefinitions}
          canViewScheduleDefinitions={canViewScheduleDefinitions}
          canManageIndicatorTypes={canManageIndicatorTypes}
          canViewIndicatorTypes={canViewIndicatorTypes}
          canManageOrgSettings={canManageOrgSettings}
          coverageRequirements={coverageRequirements}
          onCoverageRequirementsChange={setCoverageRequirements}
          canManageCoverageRequirements={canManageCoverageRequirements}
          canViewCoverageRequirements={canViewCoverageRequirements}
          absenceTypes={absenceTypes}
          onAbsenceTypesChange={handleAbsenceTypesChange}
        />
      )}
    </div>
  );
}

export default function SettingsRoute() {
  return (
    <ProtectedRoute>
      <SettingsPageContent />
    </ProtectedRoute>
  );
}

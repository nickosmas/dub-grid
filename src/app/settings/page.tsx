"use client";

import SettingsPage from "@/components/SettingsPage";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, usePermissions } from "@/hooks";

function SettingsPageContent() {
  const {
    canManageOrg,
    isSuperAdmin,
    isGridmaster,
    canManageOrgLabels,
    canManageFocusAreas,
    canManageShiftCodes,
    canManageIndicatorTypes,
    canManageOrgSettings,
    canManageCoverageRequirements,
  } = usePermissions();
  const {
    org, focusAreas, shiftCodes, shiftCategories, indicatorTypes,
    certifications, orgRoles, coverageRequirements, loading, loadError,
    setOrg, setFocusAreas, handleShiftCodesChange, setShiftCategories,
    setIndicatorTypes, handleCertificationsChange, setOrgRoles, setCoverageRequirements,
  } = useOrganizationData();
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
          shiftCodes={shiftCodes}
          shiftCategories={shiftCategories}
          indicatorTypes={indicatorTypes}
          certifications={certifications}
          orgRoles={orgRoles}
          onOrganizationSave={setOrg}
          onFocusAreasChange={setFocusAreas}
          onShiftCodesChange={handleShiftCodesChange}
          onShiftCategoriesChange={setShiftCategories}
          onIndicatorTypesChange={setIndicatorTypes}
          onCertificationsChange={handleCertificationsChange}
          onOrgRolesChange={setOrgRoles}
          canManageOrg={canManageOrg}
          isSuperAdmin={isSuperAdmin}
          isGridmaster={isGridmaster}
          canManageOrgLabels={canManageOrgLabels}
          canManageFocusAreas={canManageFocusAreas}
          canManageShiftCodes={canManageShiftCodes}
          canManageIndicatorTypes={canManageIndicatorTypes}
          canManageOrgSettings={canManageOrgSettings}
          coverageRequirements={coverageRequirements}
          onCoverageRequirementsChange={setCoverageRequirements}
          canManageCoverageRequirements={canManageCoverageRequirements}
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

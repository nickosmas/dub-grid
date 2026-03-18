"use client";

import { useEffect } from "react";
import Header from "@/components/Header";
import SettingsPage from "@/components/SettingsPage";
import ProgressBar from "@/components/ProgressBar";
import { usePageTransition } from "@/components/PageTransition";
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
  } = usePermissions();
  const {
    org, focusAreas, shiftCodes, shiftCategories, indicatorTypes,
    certifications, orgRoles, loading, loadError,
    setOrg, setFocusAreas, handleShiftCodesChange, setShiftCategories,
    setIndicatorTypes, handleCertificationsChange, setOrgRoles,
  } = useOrganizationData();
  const { setPageReady } = usePageTransition();
  const isLoading = loading || !org;

  useEffect(() => {
    if (!isLoading || (loadError && !org)) setPageReady();
  }, [isLoading, loadError, org, setPageReady]);

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
      <div
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--color-bg)",
          boxShadow: "var(--shadow-raised)",
        }}
      >
        <Header orgName={org?.name} />
      </div>

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

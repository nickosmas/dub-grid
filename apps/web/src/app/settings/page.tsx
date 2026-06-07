"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import SettingsPage from "@/components/settings/SettingsPage";
import BillingSettings from "@/components/settings/BillingSettings";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { queryKeys } from "@/lib/query-keys";
import { useOrganizationData, usePermissions } from "@/hooks";

function BillingRecoverySettings({ orgId }: { orgId: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "var(--color-bg)",
        minHeight: "100vh",
        color: "var(--color-text-primary)",
      }}
    >
      <ProgressBar loading={false} />
      <main
        style={{
          width: "100%",
          maxWidth: 980,
          margin: "0 auto",
          padding: "32px 40px",
        }}
      >
        <BillingSettings organization={{ id: orgId }} />
      </main>
    </div>
  );
}

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const {
    role,
    orgId,
    canManageOrg,
    canAccessSettings,
    canManageEmployees,
    isSuperAdmin,
    isGridmaster,
    isLoading: permissionsLoading,
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
  // Anyone authenticated can hit /settings — the sidebar surfaces Account
  // groups for everyone and Org groups for users with org-settings access.
  const hasOrgSettingsAccess =
    isGridmaster || isSuperAdmin || (role === "admin" && canAccessSettings);
  const isBillingRecoverySection =
    searchParams.get("section") === "org-billing";
  const shouldCheckBillingRecovery =
    !permissionsLoading &&
    isBillingRecoverySection &&
    isSuperAdmin &&
    !isGridmaster &&
    Boolean(orgId);
  const billingRecoveryQuery = useQuery({
    queryKey: queryKeys.org.billing(orgId!),
    queryFn: () => fetchOrganizationBilling(orgId!),
    enabled: shouldCheckBillingRecovery,
    staleTime: 30_000,
  });
  const isCheckingBillingRecovery =
    shouldCheckBillingRecovery && billingRecoveryQuery.isLoading;
  const billingRecoveryOrgId =
    billingRecoveryQuery.data?.billingAccess.isLocked === true
      ? orgId
      : null;
  const {
    org, focusAreas, absenceTypes, shiftCategories, jobs, indicatorTypes,
    certifications, orgRoles, departments, coverageRequirements, loading, loadError,
    setOrg, setFocusAreas, handleAbsenceTypesChange, setShiftCategories,
    setJobs, setIndicatorTypes, handleCertificationsChange, setOrgRoles, setDepartments, setCoverageRequirements,
  } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
    enabled:
      hasOrgSettingsAccess &&
      !isCheckingBillingRecovery &&
      !billingRecoveryOrgId,
  });
  // For account-only users we don't wait on org-data fetching.
  const isLoading = permissionsLoading
    || isCheckingBillingRecovery
    || (hasOrgSettingsAccess && (loading || !org));

  if (billingRecoveryOrgId) {
    return <BillingRecoverySettings orgId={billingRecoveryOrgId} />;
  }

  if (loadError && !org && hasOrgSettingsAccess) {
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
          orgId={orgId}
          canManageOrg={canManageOrg}
          canAccessSettings={canAccessSettings}
          isSuperAdmin={isSuperAdmin}
          isGridmaster={isGridmaster}
          canManageEmployees={canManageEmployees}
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

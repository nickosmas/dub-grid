"use client";

import { useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import DashboardView from "@/components/dashboard/DashboardView";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";
import OrganizationBootstrapRecovery from "@/components/onboarding/OrganizationBootstrapRecovery";
import { queryKeys } from "@/lib/query-keys";

const GridmasterPortal = dynamic(() => import("@/components/gridmaster/GridmasterPortal"), {
  loading: () => null,
});

function DashboardContent() {
  const router = useRouter();
  const perms = usePermissions();
  // Management-only, non-admin accounts (management department access, no
  // scheduled focus area) only get Schedule + People — mirrors the nav
  // gating in Header.tsx. Bounce them off Dashboard entirely rather than
  // just hiding the nav link.
  const isManagementOnlyUser =
    !perms.isLoading && perms.role === "user" && perms.isManagementUser && !perms.isOnSchedule;

  useEffect(() => {
    if (isManagementOnlyUser) {
      router.replace("/schedule");
    }
  }, [isManagementOnlyUser, router]);

  const {
    org,
    focusAreas,
    assignments: assignments,
    allAssignmentDefinitions,
    shiftCategories,
    jobs,
    coverageRequirements,
    assignmentLabelMap: assignmentLabelMap,
    assignmentNameMap,
    absenceTypeMap,
    absenceTypes,
    certifications,
    orgRoles,
    departments,
    loading: refLoading,
    loadError,
    bootstrapRetryable,
  } = useOrganizationData();
  const queryClient = useQueryClient();
  const retryOrganizationBootstrap = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: queryKeys.org.bootstrap() });
  }, [queryClient]);
  const { employees, loading: empLoading } = useEmployees(perms.orgId ?? org?.id ?? null);

  const isLoading = refLoading || empLoading || perms.isLoading;

  const assignmentById = useMemo(() => {
    const map = new Map<number, (typeof assignments)[number]>();
    for (const preset of assignments) map.set(preset.id, preset);
    return map;
  }, [assignments]);

  if (isManagementOnlyUser) {
    return <ProgressBar loading />;
  }

  if (loadError && !org) {
    return (
      <OrganizationBootstrapRecovery
        automaticallyRetry={bootstrapRetryable}
        onRetry={retryOrganizationBootstrap}
      />
    );
  }

  return (
    <>
      <ProgressBar loading={isLoading} />

      {!isLoading && org && (
        <DashboardView
          org={org}
          focusAreas={focusAreas}
          assignments={assignments}
          allAssignmentDefinitions={allAssignmentDefinitions}
          shiftCategories={shiftCategories}
          jobs={jobs}
          coverageRequirements={coverageRequirements}
          assignmentLabelMap={assignmentLabelMap}
          assignmentNameMap={assignmentNameMap}
          assignmentById={assignmentById}
          absenceTypeMap={absenceTypeMap}
          absenceTypes={absenceTypes}
          certifications={certifications}
          orgRoles={orgRoles}
          departments={departments}
          employees={employees}
          permissions={perms}
        />
      )}
    </>
  );
}

export default function DashboardPageContent() {
  const { isGridmaster, isLoading } = usePermissions();

  if (isLoading) {
    return <ProgressBar loading />;
  }

  // Gridmaster users also see their portal from the default post-login route.
  if (isGridmaster) {
    return <GridmasterPortal />;
  }

  return (
    <ProtectedRoute>
      <SetupGuard>
        <DashboardContent />
      </SetupGuard>
    </ProtectedRoute>
  );
}

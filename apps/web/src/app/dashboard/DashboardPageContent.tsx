"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import DashboardView from "@/components/dashboard/DashboardView";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";

const GridmasterPortal = dynamic(() => import("@/components/gridmaster/GridmasterPortal"), {
  loading: () => null,
});

function DashboardContent() {
  const perms = usePermissions();
  const {
    org,
    focusAreas,
    assignments: assignments,
    shiftCategories,
    coverageRequirements,
    assignmentLabelMap: assignmentLabelMap,
    absenceTypeMap,
    absenceTypes,
    certifications,
    orgRoles,
    departments,
    loading: refLoading,
    loadError,
  } = useOrganizationData();
  const {
    employees,
    loading: empLoading,
  } = useEmployees(perms.orgId ?? org?.id ?? null);

  const isLoading = refLoading || empLoading || perms.isLoading;

  const assignmentById = useMemo(() => {
    const map = new Map<number, (typeof assignments)[number]>();
    for (const preset of assignments) map.set(preset.id, preset);
    return map;
  }, [assignments]);

  if (loadError && !org) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        <p style={{ color: "var(--color-text-muted)" }}>{loadError}</p>
      </div>
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
          shiftCategories={shiftCategories}
          coverageRequirements={coverageRequirements}
          assignmentLabelMap={assignmentLabelMap}
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

  // Gridmaster users see the gridmaster portal at /dashboard
  // (the gridmaster subdomain makes the role obvious, no need for /gridmaster path)
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

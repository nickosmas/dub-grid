"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import DashboardView from "@/components/dashboard/DashboardView";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";

const GridmasterPortal = dynamic(() => import("@/app/gridmaster/page"), {
  loading: () => null,
});

function DashboardPageContent() {
  const perms = usePermissions();
  const {
    org,
    focusAreas,
    shiftCodes,
    shiftCategories,
    coverageRequirements,
    shiftCodeMap,
    loading: refLoading,
    loadError,
  } = useOrganizationData();
  const {
    employees,
    benchedEmployees,
    loading: empLoading,
  } = useEmployees(perms.orgId ?? org?.id ?? null);

  const isLoading = refLoading || empLoading || perms.isLoading;

  const shiftCodeById = useMemo(() => {
    const map = new Map<number, (typeof shiftCodes)[number]>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    return map;
  }, [shiftCodes]);

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
          shiftCodes={shiftCodes}
          shiftCategories={shiftCategories}
          coverageRequirements={coverageRequirements}
          shiftCodeMap={shiftCodeMap}
          shiftCodeById={shiftCodeById}
          employees={employees}
          benchedCount={benchedEmployees.length}
          permissions={perms}
        />
      )}
    </>
  );
}

export default function DashboardPage() {
  const { isGridmaster, isLoading } = usePermissions();

  if (isLoading) return null;

  // Gridmaster users see the gridmaster portal at /dashboard
  // (the gridmaster subdomain makes the role obvious, no need for /gridmaster path)
  if (isGridmaster) {
    return <GridmasterPortal />;
  }

  return (
    <ProtectedRoute>
      <SetupGuard>
        <DashboardPageContent />
      </SetupGuard>
    </ProtectedRoute>
  );
}

"use client";

import { useMemo } from "react";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import DashboardView from "@/components/dashboard/DashboardView";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";

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
  return (
    <ProtectedRoute>
      <DashboardPageContent />
    </ProtectedRoute>
  );
}

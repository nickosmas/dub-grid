"use client";

import { useState, useMemo, useEffect } from "react";
import StaffView from "@/components/StaffView";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";

function StaffPageContent() {
  const { canViewStaff, canEditShifts, canManageEmployees, isLoading: permsLoading, orgId } = usePermissions();
  const {
    org, focusAreas, shiftCodes, certifications, orgRoles, shiftCodeMap,
    loading: refLoading, loadError,
  } = useOrganizationData();
  const {
    employees, benchedEmployees, terminatedEmployees,
    loading: empLoading,
    handleAddEmployee, handleSaveEmployee, handleDeleteEmployee,
    handleBenchEmployee, handleActivateEmployee,
  } = useEmployees(orgId ?? org?.id ?? null);

  const [showAddModal, setShowAddModal] = useState(false);
  const isLoading = refLoading || empLoading || permsLoading;

  useEffect(() => {
    if (!permsLoading && !canViewStaff) {
      window.location.replace("/schedule");
    }
  }, [permsLoading, canViewStaff]);

  const staffEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.focusAreaIds.length > 0)
        .sort((a, b) => a.seniority - b.seniority),
    [employees],
  );

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
        <>
          <StaffView
            employees={staffEmployees}
            benchedEmployees={benchedEmployees}
            terminatedEmployees={terminatedEmployees}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={orgRoles}
            onSave={handleSaveEmployee}
            onDelete={handleDeleteEmployee}
            onBench={handleBenchEmployee}
            onActivate={handleActivateEmployee}
            onAdd={() => setShowAddModal(true)}
            orgId={org?.id ?? ""}
            shiftCodes={shiftCodes}
            shiftCodeMap={shiftCodeMap}
            canEditShifts={canEditShifts}
            canManageEmployees={canManageEmployees}
            focusAreaLabel={org?.focusAreaLabel}
            certificationLabel={org?.certificationLabel}
            roleLabel={org?.roleLabel}
            orgName={org?.name}
          />

          {showAddModal && (
            <AddEmployeeModal
              focusAreas={focusAreas}
              certifications={certifications}
              onAdd={async (dataList) => {
                await handleAddEmployee(dataList);
                setShowAddModal(false);
              }}
              onClose={() => setShowAddModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function StaffPage() {
  return (
    <ProtectedRoute>
      <StaffPageContent />
    </ProtectedRoute>
  );
}

"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import StaffView from "@/components/StaffView";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";
import type { NewEmployeeData } from "@/components/AddEmployeeModal";

function PeopleContent() {
  const {
    canViewStaff,
    canViewEmployeeDetails,
    canEditShifts,
    canViewRecurringShifts,
    canManageRecurringShifts,
    canManageEmployees,
    isSuperAdmin,
    isGridmaster,
    isLoading: permsLoading,
    orgId,
  } = usePermissions();
  const {
    org, focusAreas, assignments, shiftCategories, jobs, certifications, orgRoles, departments, assignmentLabelMap, absenceTypes,
    loading: refLoading, loadError, setupStatus,
  } = useOrganizationData();
  const {
    employees, inactiveEmployees, removedEmployees,
    loading: empLoading,
    handleAddEmployee, handleSaveEmployee, handleRemoveEmployee,
    handleDeactivateEmployee, handleActivateEmployee,
  } = useEmployees(orgId ?? org?.id ?? null);

  const [showAddModal, setShowAddModal] = useState(false);
  const isLoading = refLoading || empLoading || permsLoading;

  useEffect(() => {
    if (!permsLoading && !canViewStaff) {
      toast.info("You don't have access to the People page.");
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

  // Don't render content until permissions are resolved and access is confirmed
  if (permsLoading || !canViewStaff) {
    return <ProgressBar loading />;
  }

  if (loadError && !org) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <p style={{ color: "var(--color-text-muted)" }}>{loadError}</p>
      </div>
    );
  }

  return (
    <>
      <ProgressBar loading={isLoading} />

      {!isLoading && (
        <>
          <StaffView
            employees={staffEmployees}
            inactiveEmployees={inactiveEmployees}
            removedEmployees={removedEmployees}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={orgRoles}
            onSave={handleSaveEmployee}
            onRemove={handleRemoveEmployee}
            onDeactivate={handleDeactivateEmployee}
            onActivate={handleActivateEmployee}
            onAdd={() => setShowAddModal(true)}
            orgId={org?.id ?? ""}
            assignments={assignments}
            shiftCategories={shiftCategories}
            jobs={jobs}
            assignmentLabelMap={assignmentLabelMap}
            absenceTypes={absenceTypes}
            departments={departments}
            departmentLabel={org?.departmentLabel}
            canEditShifts={canEditShifts}
            canViewRecurringShifts={canViewRecurringShifts}
            canManageRecurringShifts={canManageRecurringShifts}
            canViewEmployeeDetails={canViewEmployeeDetails}
            canManageEmployees={canManageEmployees}
            isSuperAdmin={isSuperAdmin}
            isGridmaster={isGridmaster}
            focusAreaLabel={org?.focusAreaLabel}
            certificationLabel={org?.certificationLabel}
            roleLabel={org?.roleLabel}
            orgName={org?.name}
            shiftDisplayMode={org?.shiftDisplayMode}
            setupIncomplete={!setupStatus.isComplete}
          />

          {showAddModal && (
            <AddEmployeeModal
              focusAreas={focusAreas}
              certifications={certifications}
              focusAreaLabel={org?.focusAreaLabel}
              certificationLabel={org?.certificationLabel}
              onAdd={async (dataList: NewEmployeeData[]) => {
                await handleAddEmployee(dataList);
                setShowAddModal(false);
              }}
              onClose={() => setShowAddModal(false)}
            />
          )}
        </>
      )}
    </>
  );
}

export default function PeoplePageContent() {
  return (
    <ProtectedRoute>
      <PeopleContent />
    </ProtectedRoute>
  );
}

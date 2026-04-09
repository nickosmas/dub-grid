"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import StaffView from "@/components/StaffView";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, useEmployees, usePermissions, useDirectory } from "@/hooks";
import { linkEmployeeToUser } from "@/lib/db";
import type { NewEmployeeData } from "@/components/AddEmployeeModal";
import { TooltipTourRunner } from "@/components/tooltip-tour";
import { peopleTour } from "@/components/tooltip-tour/tours/people";

function PeopleContent() {
  const { canViewStaff, canViewEmployeeDetails, canEditShifts, canManageEmployees, isSuperAdmin, isGridmaster, isLoading: permsLoading, orgId } = usePermissions();
  const {
    org, focusAreas, shiftCodes, certifications, orgRoles, departments, shiftCodeMap, absenceTypes,
    loading: refLoading, loadError, setupStatus,
  } = useOrganizationData();
  const {
    employees, benchedEmployees, terminatedEmployees,
    loading: empLoading,
    handleAddEmployee, handleSaveEmployee, handleDeleteEmployee,
    handleBenchEmployee, handleActivateEmployee,
  } = useEmployees(orgId ?? org?.id ?? null);

  const { directory } = useDirectory(orgId ?? org?.id ?? null);
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
            absenceTypes={absenceTypes}
            departments={departments}
            departmentLabel={org?.departmentLabel}
            canEditShifts={canEditShifts}
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
              directory={directory}
              onAdd={async (dataList: NewEmployeeData[]) => {
                const created = await handleAddEmployee(dataList);
                // Auto-link any matched app-only users
                const effectiveOrgId = orgId ?? org?.id;
                if (created && effectiveOrgId) {
                  for (let i = 0; i < dataList.length; i++) {
                    const item = dataList[i];
                    const emp = created[i];
                    if (item._linkToUserId && emp?.id) {
                      try {
                        await linkEmployeeToUser(emp.id, item._linkToUserId, effectiveOrgId);
                      } catch {
                        // Non-blocking — employee was created, link failed
                        toast.error(`Created employee but failed to link app account for ${item.firstName} ${item.lastName}`);
                      }
                    }
                  }
                }
                setShowAddModal(false);
              }}
              onClose={() => setShowAddModal(false)}
            />
          )}

          <TooltipTourRunner config={peopleTour} />
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

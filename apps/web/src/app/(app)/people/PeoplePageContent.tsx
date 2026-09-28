"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import StaffView from "@/components/StaffView";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";
import type { NewEmployeeData } from "@/components/AddEmployeeModal";
import OrganizationBootstrapRecovery from "@/components/onboarding/OrganizationBootstrapRecovery";
import { queryKeys } from "@/lib/query-keys";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { useSharedStepUp } from "@/hooks/useSharedStepUp";

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
    isManagementUser,
    isLoading: permsLoading,
    orgId,
  } = usePermissions();
  const {
    org,
    focusAreas,
    assignments,
    shiftCategories,
    jobs,
    certifications,
    orgRoles,
    departments,
    assignmentLabelMap,
    absenceTypes,
    loading: refLoading,
    loadError,
    bootstrapRetryable,
    setupStatus,
  } = useOrganizationData();
  const queryClient = useQueryClient();
  const retryOrganizationBootstrap = useCallback(async () => {
    await queryClient.resetQueries({ queryKey: queryKeys.org.bootstrap() });
  }, [queryClient]);
  const {
    employees,
    inactiveEmployees,
    removedEmployees,
    loading: empLoading,
    handleAddEmployee,
    handleSaveEmployee,
    handleSaveEmployeeWithReinvite,
    handleRemoveEmployee,
    handleDeactivateEmployee,
    handleActivateEmployee,
  } = useEmployees(orgId ?? org?.id ?? null);

  // Only an impersonating Gridmaster is asked for fresh proof (F-96).
  const statusStepUp = useSharedStepUp();
  /** Resolves whether the change went through; a cancelled prompt counts as not. */
  const runStatusChange = async (
    action: (accessToken?: string) => Promise<boolean>,
  ): Promise<boolean> => {
    let updated = false;
    try {
      const completed = await statusStepUp.run(async (accessToken) => {
        updated = await action(accessToken);
      });
      return completed && updated;
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "We couldn't update their status. Try again."));
      return false;
    }
  };

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
      employees.filter((e) => e.focusAreaIds.length > 0).sort((a, b) => a.seniority - b.seniority),
    [employees],
  );

  // While permissions are resolving, show the indicator. Once resolved, if
  // the viewer can't access People, render nothing — the useEffect above is
  // already navigating away, so flashing a fake loading bar to an
  // unauthorized user just wastes a paint. (audit L1)
  if (permsLoading) {
    return <ProgressBar loading />;
  }
  if (!canViewStaff) {
    return null;
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
      {statusStepUp.dialog}

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
            onSaveWithReinvite={handleSaveEmployeeWithReinvite}
            onRemove={(empId, note) =>
              runStatusChange((token) => handleRemoveEmployee(empId, note, token))
            }
            onDeactivate={(empId, note) =>
              runStatusChange((token) => handleDeactivateEmployee(empId, note, token))
            }
            statusStepUpOpen={Boolean(statusStepUp.dialog)}
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
            isManagementUser={isManagementUser}
            focusAreaLabel={org?.focusAreaLabel}
            certificationLabel={org?.certificationLabel}
            roleLabel={org?.roleLabel}
            useCompactRoleCertificationLabels={org?.useCompactRoleCertificationLabels ?? false}
            shiftDisplayMode={org?.shiftDisplayMode}
            defaultShiftEnabled={org?.defaultShiftEnabled ?? true}
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

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmployeeManagementAccessModal } from "@/components/staff/EmployeeManagementAccessModal";
import { useDirectory, useOrganizationData, usePermissions } from "@/hooks";
import { isSelfAction, SelfActionForbiddenError } from "@dubgrid/domain";
import { useAuth } from "@/components/AuthProvider";
import {
  activateEmployee,
  deactivateEmployee,
  fetchEmployeeById,
  fetchEmployeeInvitations,
  fetchEmployeeRoleHistory,
  fetchEmployeeShifts,
  updateEmployee,
  removeEmployee,
  EmployeeContactConflictError,
  EmployeeStatusConflictError,
  OptimisticLockError,
} from "@/features/employees/client";
import { queryKeys } from "@/lib/query-keys";
import { mergeEmployeeIntoDirectoryPerson, upsertEmployeeInList } from "@/lib/staff-directory";
import { computeEmployeeWeeklyHours, getWeekDates, getWeekStart } from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import type {
  DirectoryPerson,
  Employee,
  RecurringShift,
  ShiftMap,
  Invitation,
  AuditLogEntry,
  ShiftRequest,
} from "@/types";
import {
  fetchRecurringShifts,
  fetchScheduleActorNames,
  fetchShiftRequests,
} from "@/features/schedule/client";
import { revokeInvitation } from "@/features/organization/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { StaffDetailHeader } from "./StaffDetailHeader";
import EditEmployeePanel from "@/components/EditEmployeePanel";
import { EmployeeStatusActions } from "./EmployeeStatusActions";
import { ProfileSectionTabs } from "@/components/profile/ProfileSectionTabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { ScheduleTab } from "./tabs/ScheduleTab";
import { ActivityTab } from "./tabs/ActivityTab";

interface StaffDetailPageProps {
  employeeId: string;
}

export function StaffDetailPage({ employeeId }: StaffDetailPageProps) {
  const router = useRouter();
  const perms = usePermissions();
  const { user: currentUser } = useAuth();
  const {
    org,
    focusAreas,
    assignments: assignments,
    absenceTypes,
    shiftCategories,
    certifications,
    orgRoles,
    departments,
    assignmentLabelMap,
    absenceTypeMap,
    loading: orgLoading,
  } = useOrganizationData();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [roleHistory, setRoleHistory] = useState<AuditLogEntry[]>([]);
  const [shiftRequests, setShiftRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "schedule" | "activity">(
    "overview",
  );
  const [showManagementPanel, setShowManagementPanel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showManagementAccessModal, setShowManagementAccessModal] = useState(false);
  const [quickRevokeInviteConfirm, setQuickRevokeInviteConfirm] = useState<Invitation | null>(null);
  const [quickRevokingInvite, setQuickRevokingInvite] = useState(false);

  const orgId = perms.orgId ?? org?.id ?? null;
  const { directory } = useDirectory(orgId);
  const queryClient = useQueryClient();

  // Employee-scoped invitation list. Key is a sub-prefix of
  // `queryKeys.org.invitations(orgId)` so realtime invalidation of the
  // org-level prefix automatically refreshes this query too.
  const invitationsQuery = useQuery<Invitation[]>({
    queryKey: orgId
      ? [...queryKeys.org.invitations(orgId), employeeId]
      : ["org", "anon", "invitations", employeeId],
    queryFn: () => fetchEmployeeInvitations(orgId!, employeeId),
    enabled: !!orgId,
  });
  const invitations = invitationsQuery.data ?? [];

  useEffect(() => {
    if (perms.isLoading) return;
    if (perms.canViewEmployeeDetails) return;
    toast.info("You don't have access to employee details.");
    router.replace("/people");
  }, [perms.canViewEmployeeDetails, perms.isLoading, router]);

  const assignmentById = useMemo(() => {
    const map = new Map<number, (typeof assignments)[number]>();
    for (const preset of assignments) map.set(preset.id, preset);
    return map;
  }, [assignments]);

  const categoryById = useMemo(() => {
    const map = new Map<number, (typeof shiftCategories)[number]>();
    for (const cat of shiftCategories) map.set(cat.id, cat);
    return map;
  }, [shiftCategories]);

  const focusAreaById = useMemo(() => {
    const map = new Map<number, (typeof focusAreas)[number]>();
    for (const fa of focusAreas) map.set(fa.id, fa);
    return map;
  }, [focusAreas]);

  const absenceTypeById = useMemo(() => {
    const map = new Map<number, (typeof absenceTypes)[number]>();
    for (const at of absenceTypes) map.set(at.id, at);
    return map;
  }, [absenceTypes]);

  // Fetch employee data once we have orgId
  useEffect(() => {
    if (perms.isLoading || !perms.canViewEmployeeDetails) return;
    if (!orgId || orgLoading) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const emp = await fetchEmployeeById(employeeId, orgId);
        if (cancelled) return;
        if (!emp) {
          setError("Employee not found");
          setLoading(false);
          return;
        }
        setEmployee(emp);

        // Fetch the rest in parallel
        const [empShifts, recShifts, empRequests] = await Promise.all([
          fetchEmployeeShifts(employeeId, orgId, assignmentLabelMap, absenceTypeMap),
          perms.canViewRecurringShifts
            ? fetchRecurringShifts(orgId, employeeId, assignmentLabelMap, false, absenceTypeMap)
            : Promise.resolve([]),
          fetchShiftRequests(orgId, assignmentLabelMap, { empId: employeeId }),
        ]);

        if (cancelled) return;
        setShifts(empShifts);
        setRecurringShifts(recShifts);
        setShiftRequests(empRequests);

        if (emp.userId && perms.isGridmaster) {
          try {
            const history = await fetchEmployeeRoleHistory(emp.userId, orgId);
            if (!cancelled) setRoleHistory(history);
          } catch {
            // Non-critical — don't crash the page if audit log is unavailable
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(formatClientErrorMessage(err, "We couldn't load this employee right now."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    employeeId,
    orgId,
    orgLoading,
    assignmentLabelMap,
    absenceTypeMap,
    perms.canViewEmployeeDetails,
    perms.canViewRecurringShifts,
    perms.isGridmaster,
    perms.isLoading,
  ]);

  useEffect(() => {
    setActiveSection("overview");
    setShowManagementPanel(false);
    setShowInviteModal(false);
    setShowManagementAccessModal(false);
  }, [employeeId]);

  const refreshInvitations = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.org.invitations(orgId),
    });
  }, [orgId, queryClient]);

  const refreshDirectory = useCallback(() => {
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
  }, [orgId, queryClient]);

  const syncEmployeeCaches = useCallback(
    (updatedEmployee?: Employee | null) => {
      if (!orgId || !updatedEmployee) return;

      setEmployee(updatedEmployee);
      queryClient.setQueryData(queryKeys.employees.all(orgId), (current: Employee[] | undefined) =>
        current ? upsertEmployeeInList(current, updatedEmployee) : current,
      );
      queryClient.setQueryData(
        queryKeys.org.directory(orgId),
        (current: DirectoryPerson[] | undefined) =>
          current?.map((person) =>
            person.employeeId === updatedEmployee.id
              ? mergeEmployeeIntoDirectoryPerson(person, updatedEmployee)
              : person,
          ) ?? current,
      );
    },
    [orgId, queryClient],
  );

  const handleSaveEmployee = useCallback(
    async (updatedEmployee: Employee) => {
      if (!orgId || !employee) return;
      const previousEmployee = employee;
      setEmployee(updatedEmployee);
      try {
        await updateEmployee(updatedEmployee, orgId, previousEmployee.version);
        syncEmployeeCaches(updatedEmployee);
        toast.success("Employee saved");
        refreshDirectory();
      } catch (err) {
        if (err instanceof OptimisticLockError) {
          const latestEmployee = await fetchEmployeeById(updatedEmployee.id, orgId);
          if (latestEmployee) {
            setEmployee(latestEmployee);
            syncEmployeeCaches(latestEmployee);
          } else {
            setEmployee(previousEmployee);
          }
          toast.error(
            "Employee details changed elsewhere. Review the latest values and try again.",
          );
          return;
        }
        setEmployee(previousEmployee);
        toast.error(
          err instanceof EmployeeContactConflictError ? err.message : "Failed to save employee",
        );
      }
    },
    [employee, orgId, refreshDirectory, syncEmployeeCaches],
  );

  // ── Status action handlers ──────────────────────────────────────────────────
  const handleDeactivate = useCallback(
    async (empId: string, note?: string) => {
      if (!orgId || !employee) return;
      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              status: "inactive" as const,
              statusNote: note ?? "",
              statusChangedAt: new Date().toISOString(),
            }
          : prev,
      );
      try {
        const updatedEmployee = await deactivateEmployee(empId, note, orgId, employee.version);
        syncEmployeeCaches(updatedEmployee);
        toast.success("Employee marked inactive");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setEmployee(err.latestEmployee);
          syncEmployeeCaches(err.latestEmployee);
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
          return;
        }
        // Revert on failure
        setEmployee((prev) =>
          prev ? { ...prev, status: "active" as const, statusNote: "" } : prev,
        );
        if (err instanceof SelfActionForbiddenError) {
          toast.error(err.message);
          return;
        }
        toast.error("Failed to update employee status");
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleActivate = useCallback(
    async (empId: string) => {
      if (!orgId || !employee) return;
      const prevStatus = employee?.status;
      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              status: "active" as const,
              statusNote: "",
              statusChangedAt: new Date().toISOString(),
            }
          : prev,
      );
      try {
        const updatedEmployee = await activateEmployee(empId, orgId, employee.version);
        syncEmployeeCaches(updatedEmployee);
        toast.success("Employee activated");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setEmployee(err.latestEmployee);
          syncEmployeeCaches(err.latestEmployee);
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
          return;
        }
        setEmployee((prev) => (prev ? { ...prev, status: prevStatus ?? "inactive" } : prev));
        if (err instanceof SelfActionForbiddenError) {
          toast.error(err.message);
          return;
        }
        toast.error("Failed to activate employee");
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleRemove = useCallback(
    async (empId: string, note?: string) => {
      if (!orgId || !employee) return;
      const prevStatus = employee?.status;
      setEmployee((prev) =>
        prev
          ? { ...prev, status: "removed" as const, statusChangedAt: new Date().toISOString() }
          : prev,
      );
      try {
        const updatedEmployee = await removeEmployee(empId, orgId, employee.version, note);
        syncEmployeeCaches(updatedEmployee);
        toast.success("Employee removed");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setEmployee(err.latestEmployee);
          syncEmployeeCaches(err.latestEmployee);
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
          return;
        }
        setEmployee((prev) => (prev ? { ...prev, status: prevStatus ?? "active" } : prev));
        if (err instanceof SelfActionForbiddenError) {
          toast.error(err.message);
          return;
        }
        toast.error("Failed to remove employee");
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const thisWeekHours = useMemo(() => {
    if (!employee) return null;
    const weekStart = getWeekStart(new Date());
    const weekDateKeys = getWeekDates(weekStart).map(formatDateKey);
    return computeEmployeeWeeklyHours(
      employee.id,
      weekDateKeys,
      shifts,
      assignmentById,
      40,
      categoryById,
    );
  }, [assignmentById, categoryById, employee, shifts]);

  // Batch-fetch profile names for shift audit display (who created/edited each shift)
  const [auditNames, setAuditNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(shifts)) {
      if (entry.createdBy) ids.add(entry.createdBy);
      if (entry.updatedBy) ids.add(entry.updatedBy);
    }
    if (ids.size === 0) return;

    let cancelled = false;
    (async () => {
      try {
        if (!orgId) return;
        const { names } = await fetchScheduleActorNames({
          ids: Array.from(ids),
          orgId,
        });
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const [id, name] of Object.entries(names)) {
          if (name) map.set(id, name);
        }
        setAuditNames(map);
      } catch {
        // Non-critical — audit names are informational
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, shifts]);

  const pendingInvite = useMemo(() => {
    return (
      invitations.find(
        (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
      ) ?? null
    );
  }, [invitations]);

  const canEditDetails = perms.canManageEmployees || perms.isSuperAdmin;
  const canManageManagementAccess = perms.isSuperAdmin || perms.isGridmaster;
  const directoryPerson = useMemo(
    () => directory.find((person) => person.employeeId === employee?.id) ?? null,
    [directory, employee?.id],
  );
  const hasPendingManagementInvite =
    !!directoryPerson &&
    directoryPerson.managementDepartmentIds.length > 0 &&
    directoryPerson.invitationStatus !== null &&
    !directoryPerson.hasAppAccess;

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!orgId) return false;
      try {
        await revokeInvitation(invitationId, orgId);
        await refreshInvitations();
        refreshDirectory();
        toast.success("Invitation revoked");
        return true;
      } catch {
        toast.error("Failed to revoke invitation");
        return false;
      }
    },
    [orgId, refreshDirectory, refreshInvitations],
  );

  const showQuickActions =
    perms.canManageEmployees ||
    canManageManagementAccess ||
    (perms.canManageEmployees && !!pendingInvite) ||
    (perms.canManageEmployees && !employee?.userId && !!employee?.email);

  const isLoading = loading || orgLoading || perms.isLoading;

  if (!perms.isLoading && !perms.canViewEmployeeDetails) {
    return <ProgressBar loading />;
  }

  if (error && !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => router.push("/people")}
            className="px-5 py-2 rounded-[var(--dg-radius-md)] border border-border bg-card text-card-foreground font-semibold text-sm cursor-pointer hover:bg-muted transition-colors"
          >
            Back to Staff
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProgressBar loading={isLoading} />

      {!isLoading && employee && org && (
        <div className="p-4 md:p-6 lg:px-12 lg:py-10">
          <div className="space-y-8 pb-10 dg-page-enter">
            <Link
              href="/people"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
              People
            </Link>

            <StaffDetailHeader
              employee={employee}
              canEditDetails={canEditDetails}
              showManagementPanel={showManagementPanel}
              onToggleEditDetails={() => setShowManagementPanel((current) => !current)}
            />

            {showQuickActions && (
              <section>
                <div className="dg-card">
                  <div className="dg-card-header">
                    <div>
                      <div className="dg-card-title">Actions</div>
                      <div className="dg-card-subtitle">
                        Common staffing and access actions for this person.
                      </div>
                    </div>
                  </div>
                  <div className="dg-card-body flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      {perms.canManageEmployees && pendingInvite && (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowInviteModal(true)}
                            className="dg-btn dg-btn-secondary dg-btn-sm"
                          >
                            Reinvite
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuickRevokeInviteConfirm(pendingInvite)}
                            className="dg-btn dg-btn-secondary dg-btn-sm"
                          >
                            Revoke Invitation
                          </button>
                        </>
                      )}

                      {perms.canManageEmployees &&
                        !pendingInvite &&
                        !employee.userId &&
                        employee.email && (
                          <button
                            type="button"
                            onClick={() => setShowInviteModal(true)}
                            className="dg-btn dg-btn-secondary dg-btn-sm"
                          >
                            Send Invitation
                          </button>
                        )}

                      {canManageManagementAccess && employee.status !== "removed" && (
                        <button
                          type="button"
                          onClick={() => setShowManagementAccessModal(true)}
                          className="dg-btn dg-btn-secondary dg-btn-sm"
                        >
                          {directoryPerson?.isManagementUser || hasPendingManagementInvite
                            ? "Edit Management Access"
                            : "Add to Management"}
                        </button>
                      )}
                    </div>

                    {perms.canManageEmployees && (
                      <div>
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
                          Staffing actions
                        </div>
                        <EmployeeStatusActions
                          employee={employee}
                          canEdit={perms.canManageEmployees}
                          isSelf={isSelfAction(currentUser?.id, employee.userId)}
                          pendingInvitation={pendingInvite ?? undefined}
                          onDeactivate={handleDeactivate}
                          onActivate={handleActivate}
                          onRemove={handleRemove}
                          onInvite={orgId ? () => setShowInviteModal(true) : undefined}
                          onRevoke={handleRevokeInvitation}
                          variant="page"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {canEditDetails && showManagementPanel && (
              <section>
                <div className="dg-card">
                  <div className="dg-card-header">
                    <div>
                      <div className="dg-card-title">Edit details</div>
                      <div className="dg-card-subtitle">
                        Update biodata, assignments, and account-related staff settings.
                      </div>
                    </div>
                  </div>

                  <EditEmployeePanel
                    employee={employee}
                    focusAreas={focusAreas}
                    certifications={certifications}
                    roles={orgRoles}
                    focusAreaLabel={org?.focusAreaLabel}
                    certificationLabel={org?.certificationLabel}
                    roleLabel={org?.roleLabel}
                    onSave={handleSaveEmployee}
                    onCancel={() => setShowManagementPanel(false)}
                  />
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                    Profile sections
                  </h2>
                  <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                    Move between overview, schedule, and activity without leaving People.
                  </p>
                </div>

                {/* ProfileSectionTabs renders the shared dg-span-tabs / dg-span-tab shell. */}
                <ProfileSectionTabs
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "schedule", label: "Schedule" },
                    { id: "activity", label: "Activity" },
                  ]}
                  activeTab={activeSection}
                  onChange={(tabId) =>
                    setActiveSection(tabId as "overview" | "schedule" | "activity")
                  }
                  className="dg-span-tabs dg-span-tabs--light"
                />
              </div>

              {activeSection === "overview" ? (
                <OverviewTab
                  employee={employee}
                  shifts={shifts}
                  assignmentById={assignmentById}
                  categoryById={categoryById}
                  focusAreas={focusAreas}
                  focusAreaLabel={org?.focusAreaLabel}
                  certifications={certifications}
                  orgRoles={orgRoles}
                  pendingInvite={pendingInvite}
                  thisWeekHours={thisWeekHours}
                  shiftDisplayMode={org?.shiftDisplayMode}
                />
              ) : null}

              {activeSection === "schedule" ? (
                <ScheduleTab
                  employee={employee}
                  shifts={shifts}
                  assignmentById={assignmentById}
                  focusAreas={focusAreas}
                  categoryById={categoryById}
                  focusAreaById={focusAreaById}
                  absenceTypeById={absenceTypeById}
                  auditNames={auditNames}
                  shiftRequests={shiftRequests}
                  recurringShifts={recurringShifts}
                  canViewRecurringShifts={perms.canViewRecurringShifts}
                  shiftDisplayMode={org?.shiftDisplayMode}
                />
              ) : null}

              {activeSection === "activity" ? (
                <ActivityTab
                  employee={employee}
                  roleHistory={roleHistory}
                  invitations={invitations}
                />
              ) : null}
            </section>
          </div>
        </div>
      )}

      {showInviteModal && employee && orgId && org && (
        <InviteEmployeeModal
          employee={employee}
          orgId={orgId}
          orgName={org.name || "your organization"}
          onClose={() => setShowInviteModal(false)}
          onInvited={async (updatedEmployee) => {
            syncEmployeeCaches(updatedEmployee);
            await refreshInvitations();
            refreshDirectory();
            void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
            setShowInviteModal(false);
          }}
        />
      )}

      {showManagementAccessModal && employee && orgId && org && (
        <EmployeeManagementAccessModal
          employee={employee}
          orgId={orgId}
          orgName={org.name || "your organization"}
          managementDepartments={(departments ?? []).filter(
            (department) => department.type === "management",
          )}
          directoryPerson={directoryPerson}
          pendingInvitation={pendingInvite ?? undefined}
          onClose={() => setShowManagementAccessModal(false)}
          onCompleted={async (updatedEmployee) => {
            syncEmployeeCaches(updatedEmployee);
            await refreshInvitations();
            refreshDirectory();
            void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
          }}
        />
      )}

      {quickRevokeInviteConfirm ? (
        <ConfirmDialog
          title="Revoke Invitation?"
          message={`Revoke the pending invitation for ${quickRevokeInviteConfirm.email}? The current invite link will stop working.`}
          confirmLabel="Revoke Invitation"
          variant="danger"
          isLoading={quickRevokingInvite}
          onConfirm={() => {
            const invitationId = quickRevokeInviteConfirm.id;
            setQuickRevokingInvite(true);
            void (async () => {
              try {
                await handleRevokeInvitation(invitationId);
              } finally {
                setQuickRevokingInvite(false);
                setQuickRevokeInviteConfirm(null);
              }
            })();
          }}
          onCancel={() => {
            if (!quickRevokingInvite) setQuickRevokeInviteConfirm(null);
          }}
        />
      ) : null}
    </>
  );
}

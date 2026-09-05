"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import { Button } from "@/components/Button";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import { PendingInvitationBanner } from "@/components/staff/PendingInvitationBanner";
import { EmployeeManagementAccessEditor } from "@/components/staff/EmployeeManagementAccessModal";
import { MemberAccessControls } from "@/components/staff/MemberAccessControls";
import Modal from "@/components/Modal";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { AddManagementUserToScheduleModal } from "@/components/staff/AddManagementUserToScheduleModal";
import { useDirectory, useOrganizationData, usePermissions } from "@/hooks";
import {
  isSelfAction,
  SELF_ACTION_FORBIDDEN_MESSAGE,
  SelfActionForbiddenError,
} from "@dubgrid/domain";
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
  EmployeeAccessDeniedError,
  EmployeeContactConflictError,
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
} from "@/features/employees/client";
import { queryKeys } from "@/lib/query-keys";
import { mergeEmployeeIntoDirectoryPerson, upsertEmployeeInList } from "@/lib/staff-directory";
import { computeEmployeeWeeklyHours } from "@/lib/dashboard-stats";
import {
  getProfileOverviewCurrentWeekDateKeys,
  getProfileOverviewDateRange,
} from "@/features/account/shared/profile-schedule";
import type {
  AdminPermissions,
  DirectoryPerson,
  Employee,
  RecurringShift,
  ShiftMap,
  Invitation,
  OrganizationRole,
  OrganizationUser,
  AuditLogEntry,
} from "@/types";
import { fetchRecurringShifts } from "@/features/schedule/client";
import {
  createOrganizationInvitation,
  replaceOrganizationInvitationAccessGuarded,
  revokeInvitation,
  updateOrganizationMembershipGuarded,
} from "@/features/organization/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { StaffDetailHeader } from "./StaffDetailHeader";
import EditEmployeePanel from "@/components/EditEmployeePanel";
import { EmployeeStatusActions } from "./EmployeeStatusActions";
import { OverviewTab } from "./tabs/OverviewTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { RecurringScheduleCard } from "./RecurringScheduleCard";
import { SettingsShell, type ShellNavGroup } from "@/components/settings/SettingsShell";
import { ActivityIcon, DashboardIcon, ProfileIcon } from "@/components/icons/NavIcons";

interface StaffDetailPageProps {
  employeeId: string;
}

type StaffProfileSection = "profile" | "overview" | "activity";

export function StaffDetailPage({ employeeId }: StaffDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const perms = usePermissions();
  const { user: currentUser } = useAuth();
  const {
    org,
    focusAreas,
    assignments: assignments,
    shiftCategories,
    certifications,
    orgRoles,
    departments,
    jobs,
    assignmentLabelMap,
    absenceTypes,
    absenceTypeMap,
    loading: orgLoading,
  } = useOrganizationData();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingManagementAccess, setIsEditingManagementAccess] = useState(false);
  const [managementAccessDirty, setManagementAccessDirty] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddToScheduleModal, setShowAddToScheduleModal] = useState(false);

  const orgId = perms.orgId ?? org?.id ?? null;
  const overviewRange = useMemo(
    () => getProfileOverviewDateRange(new Date(), org?.timezone),
    [org?.timezone],
  );
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
    enabled: Boolean(orgId) && !perms.isLoading && perms.canViewEmployeeDetails,
  });
  const invitations = perms.canViewEmployeeDetails ? (invitationsQuery.data ?? []) : [];
  const pendingInvite = useMemo(() => {
    return (
      invitations.find(
        (i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date(),
      ) ?? null
    );
  }, [invitations]);

  // Key is a sub-prefix of `queryKeys.org.roleHistory(orgId)`, so realtime
  // invalidation of the org-level prefix (role_change_log changes)
  // automatically refreshes this query too.
  const employeeUserId = employee?.userId ?? null;
  const roleHistoryQuery = useQuery<AuditLogEntry[]>({
    queryKey:
      orgId && employeeUserId
        ? [...queryKeys.org.roleHistory(orgId), employeeUserId]
        : ["org", "anon", "roleHistory", employeeId],
    queryFn: () => fetchEmployeeRoleHistory(employeeUserId!, orgId!),
    enabled: Boolean(orgId) && Boolean(employeeUserId) && perms.isGridmaster,
  });
  const roleHistory = roleHistoryQuery.data ?? [];

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
        const [empShifts, recShifts] = await Promise.all([
          fetchEmployeeShifts(
            employeeId,
            orgId,
            assignmentLabelMap,
            absenceTypeMap,
            overviewRange.startDate,
            overviewRange.endDate,
          ),
          perms.canViewRecurringShifts
            ? fetchRecurringShifts(orgId, employeeId, assignmentLabelMap, false, absenceTypeMap)
            : Promise.resolve([]),
        ]);

        if (cancelled) return;
        setShifts(empShifts);
        setRecurringShifts(recShifts);
      } catch (err: unknown) {
        if (!cancelled) {
          if (err instanceof EmployeeAccessDeniedError) {
            // Same treatment as the canViewEmployeeDetails gate above:
            // there's nothing to show here, so bounce back to People.
            toast.info("You don't have access to that profile.");
            router.replace("/people");
            return;
          }
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
    router,
    overviewRange.endDate,
    overviewRange.startDate,
  ]);

  useEffect(() => {
    setIsEditingManagementAccess(false);
    setShowInviteModal(false);
    setShowAddToScheduleModal(false);
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

  const syncDirectoryMembership = useCallback(
    (membership: OrganizationUser) => {
      if (!orgId) return;
      queryClient.setQueryData(
        queryKeys.org.directory(orgId),
        (current: DirectoryPerson[] | undefined) =>
          current?.map((person) =>
            person.userId === membership.id
              ? {
                  ...person,
                  orgRole: membership.orgRole,
                  adminPermissions: membership.adminPermissions,
                  membershipUpdatedAt: membership.updatedAt,
                }
              : person,
          ),
      );
    },
    [orgId, queryClient],
  );

  const handleSaveEmployee = useCallback(
    async (updatedEmployee: Employee) => {
      if (!orgId || !employee) return;
      const previousEmployee = employee;
      const revokedInvitationEmail =
        pendingInvite && (previousEmployee.email || "") !== (updatedEmployee.email || "")
          ? pendingInvite.email
          : null;
      setEmployee(updatedEmployee);
      try {
        const savedEmployee = await updateEmployee(
          updatedEmployee,
          orgId,
          previousEmployee.version,
        );
        setEmployee(savedEmployee);
        syncEmployeeCaches(savedEmployee);
        toast.success(
          revokedInvitationEmail
            ? `Employee saved. Their pending invitation to ${revokedInvitationEmail} was revoked.`
            : "Employee saved",
        );
        refreshDirectory();
        if (revokedInvitationEmail) {
          void refreshInvitations();
        }
      } catch (err) {
        if (err instanceof EmployeeProfileConflictError) {
          setEmployee(err.latestEmployee);
          syncEmployeeCaches(err.latestEmployee);
          toast.error(
            "Employee details changed elsewhere. Review the latest values and try again.",
          );
          return;
        }
        setEmployee(previousEmployee);
        toast.error(
          err instanceof EmployeeContactConflictError
            ? formatClientErrorMessage(err, "We couldn't save those details. Try again.")
            : "We couldn't save those details. Try again.",
        );
      }
    },
    [employee, orgId, pendingInvite, refreshDirectory, refreshInvitations, syncEmployeeCaches],
  );

  // Chosen from EditEmployeePanel's confirm dialog when the admin picks
  // "Save & Send" after changing the email while a pending invitation
  // exists. Saves the identity change (the DB trigger revokes the old
  // invitation as a side effect), then creates and sends a replacement
  // invitation at the new address, reusing the old one's role/departments.
  const handleSaveEmployeeWithReinvite = useCallback(
    async (updatedEmployee: Employee, oldInvitation: Invitation) => {
      if (!orgId || !employee) return;
      const previousEmployee = employee;
      setEmployee(updatedEmployee);

      let savedEmployee: Employee;
      try {
        savedEmployee = await updateEmployee(updatedEmployee, orgId, previousEmployee.version);
        setEmployee(savedEmployee);
        syncEmployeeCaches(savedEmployee);
      } catch (err) {
        if (err instanceof EmployeeProfileConflictError) {
          setEmployee(err.latestEmployee);
          syncEmployeeCaches(err.latestEmployee);
          toast.error(
            "Employee details changed elsewhere. Review the latest values and try again.",
          );
          return;
        }
        setEmployee(previousEmployee);
        toast.error(
          err instanceof EmployeeContactConflictError
            ? formatClientErrorMessage(err, "We couldn't save those details. Try again.")
            : "We couldn't save those details. Try again.",
        );
        return;
      }

      // The identity save already succeeded at this point, so a failure past
      // here must not read as the whole action failing — the employee record
      // is correctly saved either way.
      try {
        const created = await createOrganizationInvitation({
          email: savedEmployee.email,
          role: oldInvitation.roleToAssign,
          orgId,
          employeeId: savedEmployee.id,
          firstName: savedEmployee.firstName,
          lastName: savedEmployee.lastName,
          phone: savedEmployee.phone || undefined,
          departmentIds: oldInvitation.departmentIds,
          deptAdminIds: oldInvitation.deptAdminIds,
        });

        const response = await fetch("/api/send-invite-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: created.token,
            email: savedEmployee.email,
            orgName: org?.name || "your organization",
          }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          let detail = "we couldn't send the invitation email.";
          try {
            detail = formatClientErrorMessage(JSON.parse(body).error, detail).toLowerCase();
          } catch {
            /* non-JSON response */
          }
          throw new Error(`Employee saved, but ${detail}`);
        }

        toast.success(`Employee saved. A new invitation was sent to ${savedEmployee.email}.`);
      } catch (err) {
        toast.error(
          formatClientErrorMessage(
            err,
            "Employee saved, but we couldn't send the new invitation. Try Reinvite from the banner.",
          ),
        );
      } finally {
        refreshDirectory();
        void refreshInvitations();
      }
    },
    [employee, orgId, org?.name, refreshDirectory, refreshInvitations, syncEmployeeCaches],
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
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return;
        }
        toast.error("We couldn't update their status. Try again.");
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
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return;
        }
        toast.error("We couldn't reactivate them. Try again.");
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
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return;
        }
        toast.error("We couldn't remove them. Try again.");
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const thisWeekHours = useMemo(() => {
    if (!employee) return null;
    return computeEmployeeWeeklyHours(
      employee.id,
      getProfileOverviewCurrentWeekDateKeys(overviewRange),
      shifts,
      assignmentById,
      40,
      categoryById,
    );
  }, [assignmentById, categoryById, employee, overviewRange, shifts]);

  const canEditDetails = perms.canManageEmployees || perms.isSuperAdmin;
  const canManageManagementAccess = perms.isSuperAdmin || perms.isGridmaster;
  const closeManagementAccessEditor = useCallback(() => {
    setManagementAccessDirty(false);
    setIsEditingManagementAccess(false);
  }, []);
  const {
    requestClose: requestManagementAccessClose,
    unsavedChangesDialog: managementAccessUnsavedChangesDialog,
  } = useUnsavedChangesPrompt({
    hasUnsavedChanges: managementAccessDirty,
    onDiscard: closeManagementAccessEditor,
  });
  const directoryPerson = useMemo(
    () => directory.find((person) => person.employeeId === employee?.id) ?? null,
    [directory, employee?.id],
  );
  const isOnSchedule = Boolean(employee && employee.focusAreaIds.length > 0);
  const profileSection = searchParams.get("section");
  const activeSection: StaffProfileSection =
    profileSection === "activity"
      ? "activity"
      : profileSection === "overview" || (profileSection === "schedule" && isOnSchedule)
        ? "overview"
        : "profile";
  const profileNavGroups = useMemo<ShellNavGroup<StaffProfileSection>[]>(
    () => [
      {
        id: "primary",
        label: "Profile",
        items: [
          {
            id: "profile",
            label: "Profile",
            Icon: ProfileIcon,
          },
          {
            id: "overview",
            label: "Overview",
            Icon: DashboardIcon,
            description: "Current work details, assignments, weekly hours, and recurring schedule.",
          },
        ],
      },
      {
        id: "history",
        label: "History",
        items: [
          {
            id: "activity",
            label: "Activity",
            Icon: ActivityIcon,
            description: "Role and invitation history for this staff member.",
          },
        ],
      },
    ],
    [],
  );
  // Matches the directory table's Access column: the membership's role, or the
  // role a pending invitation will grant once it is accepted.
  const effectiveOrgRole = directoryPerson?.orgRole ?? pendingInvite?.roleToAssign ?? null;
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
        toast.error("We couldn't cancel that invitation. Try again.");
        return false;
      }
    },
    [orgId, refreshDirectory, refreshInvitations],
  );

  const handlePermissionsChange = useCallback(
    async (perms: AdminPermissions) => {
      if (!orgId || !directoryPerson?.userId || !directoryPerson?.membershipUpdatedAt) return;
      const updatedMembership = await updateOrganizationMembershipGuarded({
        orgId,
        userId: directoryPerson.userId,
        expectedUpdatedAt: directoryPerson.membershipUpdatedAt,
        adminPermissions: perms,
      });
      syncDirectoryMembership(updatedMembership);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.users(orgId) }),
      ]);
    },
    [orgId, directoryPerson, queryClient, syncDirectoryMembership],
  );

  const handleRoleChange = useCallback(
    async (role: OrganizationRole) => {
      if (!orgId || !directoryPerson) return;
      if (!directoryPerson.userId) {
        if (!pendingInvite?.updatedAt) return;
        await replaceOrganizationInvitationAccessGuarded({
          orgId,
          invitationId: pendingInvite.id,
          expectedUpdatedAt: pendingInvite.updatedAt,
          roleToAssign: role,
        });
        await refreshInvitations();
        refreshDirectory();
        return;
      }
      if (!directoryPerson.membershipUpdatedAt) return;
      const updatedMembership = await updateOrganizationMembershipGuarded({
        orgId,
        userId: directoryPerson.userId,
        expectedUpdatedAt: directoryPerson.membershipUpdatedAt,
        orgRole: role,
      });
      syncDirectoryMembership(updatedMembership);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.users(orgId) }),
      ]);
    },
    [
      directoryPerson,
      orgId,
      pendingInvite,
      queryClient,
      refreshDirectory,
      refreshInvitations,
      syncDirectoryMembership,
    ],
  );

  const isLoading = loading || orgLoading || perms.isLoading;

  if (!perms.isLoading && !perms.canViewEmployeeDetails) {
    return <ProgressBar loading />;
  }

  if (error && !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button
            onClick={() => router.push("/people")}
            className="px-5 py-2 rounded-[var(--dg-radius-md)] border border-border bg-card text-card-foreground font-semibold text-sm cursor-pointer hover:bg-muted transition-colors"
          >
            Back to Staff
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProgressBar loading={isLoading} />

      {!isLoading && employee && org && (
        <SettingsShell<StaffProfileSection>
          basePath={`/people/${employeeId}`}
          navGroups={profileNavGroups}
          defaultSection="profile"
          activeSection={activeSection}
          footerGroupIds={["history"]}
          hideContentGroupLabels
          leadingNavigation={{ href: "/people", label: "Back to People", Icon: ChevronLeft }}
        >
          {activeSection === "profile" && (
            <div className="space-y-6">
              <StaffDetailHeader employee={employee} orgRole={effectiveOrgRole} />

              {perms.canManageEmployees && pendingInvite && (
                <PendingInvitationBanner
                  pendingInvitation={pendingInvite}
                  onReinvite={async () => {
                    const ok = await handleRevokeInvitation(pendingInvite.id);
                    if (ok !== false) setShowInviteModal(true);
                  }}
                  onRevoke={handleRevokeInvitation}
                />
              )}

              <section>
                <div className="dg-card">
                  <div className="dg-card-header">
                    <div>
                      <div className="dg-card-title">Work details</div>
                      <div className="dg-card-subtitle">
                        Employment, {(org?.focusAreaLabel ?? "focus areas").toLowerCase()},
                        certification, roles, and notes.
                      </div>
                    </div>
                  </div>

                  {canEditDetails ? (
                    <div className="dg-card-body-sides">
                      <EditEmployeePanel
                        flushHorizontal
                        employee={employee}
                        orgId={orgId ?? undefined}
                        focusAreas={focusAreas}
                        certifications={certifications}
                        roles={orgRoles}
                        focusAreaLabel={org?.focusAreaLabel}
                        certificationLabel={org?.certificationLabel}
                        roleLabel={org?.roleLabel}
                        isManagementUser={directoryPerson?.isManagementUser}
                        persistent
                        onSave={handleSaveEmployee}
                        onCancel={() => {}}
                        pendingInvitation={pendingInvite ?? undefined}
                        onSaveWithReinvite={handleSaveEmployeeWithReinvite}
                      />
                    </div>
                  ) : (
                    <div className="dg-card-body grid gap-4 sm:grid-cols-2">
                      <ProfileField
                        label="Employment"
                        value={employee.employmentType === "part_time" ? "Part-time" : "Full-time"}
                      />
                      <ProfileField
                        label={org?.focusAreaLabel ?? "Focus areas"}
                        value={
                          employee.focusAreaIds
                            .map((id) => focusAreas.find((item) => item.id === id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      />
                      <ProfileField
                        label={org?.certificationLabel ?? "Certification"}
                        value={
                          certifications.find((item) => item.id === employee.certificationId)
                            ?.name ?? "—"
                        }
                      />
                      <ProfileField
                        label={org?.roleLabel ?? "Roles"}
                        value={
                          employee.roleIds
                            .map((id) => orgRoles.find((item) => item.id === id)?.name)
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      />
                      {employee.contactNotes ? (
                        <ProfileField label="Internal notes" value={employee.contactNotes} />
                      ) : null}
                    </div>
                  )}
                </div>
              </section>

              {(effectiveOrgRole || employee.userId || pendingInvite) && (
                <section>
                  <div className="dg-card">
                    <div className="dg-card-header">
                      <div>
                        <div className="dg-card-title">Access</div>
                        <div className="dg-card-subtitle">
                          Organization role and the permissions it carries.
                        </div>
                      </div>
                    </div>
                    {canManageManagementAccess && effectiveOrgRole ? (
                      <div className="dg-card-body flex flex-col gap-6">
                        <MemberAccessControls
                          orgRole={effectiveOrgRole}
                          adminPermissions={directoryPerson?.adminPermissions}
                          onRoleChange={handleRoleChange}
                          onPermissionsChange={
                            directoryPerson?.userId ? handlePermissionsChange : undefined
                          }
                          isSelf={isSelfAction(currentUser?.id, employee.userId)}
                          pendingInvitationEmail={pendingInvite?.email}
                        />
                      </div>
                    ) : (
                      <div className="dg-card-body grid gap-4 sm:grid-cols-2">
                        <ProfileField
                          label="Role"
                          value={
                            effectiveOrgRole
                              ? formatOrganizationRole(effectiveOrgRole)
                              : "No app access"
                          }
                        />
                      </div>
                    )}
                  </div>
                </section>
              )}

              {canManageManagementAccess &&
                orgId &&
                (directoryPerson?.isManagementUser || hasPendingManagementInvite) && (
                  <section>
                    <div className="dg-card">
                      <div className="dg-card-header">
                        <div>
                          <div className="dg-card-title">Management departments</div>
                          <div className="dg-card-subtitle">Management department assignment.</div>
                        </div>
                        {employee.status !== "removed" ? (
                          <Button
                            type="button"
                            className="dg-btn dg-btn-secondary dg-btn-sm"
                            onClick={() => setIsEditingManagementAccess(true)}
                          >
                            Edit access
                          </Button>
                        ) : null}
                      </div>
                      <div className="dg-card-body grid gap-4 sm:grid-cols-2">
                        <ProfileField
                          label="Departments"
                          value={
                            directoryPerson?.managementDepartmentIds.length
                              ? directoryPerson.managementDepartmentIds
                                  .map(
                                    (id) =>
                                      departments.find((department) => department.id === id)?.name,
                                  )
                                  .filter(Boolean)
                                  .join(", ")
                              : "—"
                          }
                        />
                      </div>
                    </div>
                  </section>
                )}

              {(perms.canManageEmployees ||
                (canManageManagementAccess &&
                  !directoryPerson?.isManagementUser &&
                  !hasPendingManagementInvite)) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {perms.canManageEmployees &&
                  !pendingInvite &&
                  !employee.userId &&
                  employee.email ? (
                    <Button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => setShowInviteModal(true)}
                    >
                      Send invitation
                    </Button>
                  ) : null}
                  {canManageManagementAccess &&
                  !directoryPerson?.isManagementUser &&
                  !hasPendingManagementInvite &&
                  employee.status !== "removed" ? (
                    <Button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => setIsEditingManagementAccess(true)}
                    >
                      Add to management
                    </Button>
                  ) : null}
                  {perms.canManageEmployees &&
                  !isOnSchedule &&
                  directoryPerson?.isManagementUser &&
                  employee.userId ? (
                    <Button
                      type="button"
                      className="dg-btn dg-btn-secondary"
                      onClick={() => setShowAddToScheduleModal(true)}
                    >
                      Add to schedule
                    </Button>
                  ) : null}
                  <EmployeeStatusActions
                    employee={employee}
                    canEdit={perms.canManageEmployees}
                    isSelf={isSelfAction(currentUser?.id, employee.userId)}
                    onDeactivate={handleDeactivate}
                    onActivate={handleActivate}
                    onRemove={handleRemove}
                    variant="page"
                  />
                </div>
              )}
            </div>
          )}
          {activeSection !== "profile" && (
            <section>
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
                  timeZone={org?.timezone}
                  scheduleOverview={
                    perms.canViewRecurringShifts ? (
                      <RecurringScheduleCard
                        recurringShifts={recurringShifts}
                        assignments={assignments}
                        absenceTypes={absenceTypes}
                        shiftCategories={shiftCategories}
                        jobs={jobs}
                      />
                    ) : undefined
                  }
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
          )}
        </SettingsShell>
      )}

      {isEditingManagementAccess && orgId && org && employee && (
        <Modal
          title={
            directoryPerson?.isManagementUser || hasPendingManagementInvite
              ? "Edit management access"
              : "Add to management"
          }
          onClose={closeManagementAccessEditor}
          onRequestClose={requestManagementAccessClose}
          style={{ maxWidth: 560, width: "100%" }}
        >
          <EmployeeManagementAccessEditor
            employee={employee}
            orgId={orgId}
            orgName={org.name || "your organization"}
            managementDepartments={(departments ?? []).filter(
              (department) => department.type === "management",
            )}
            directoryPerson={directoryPerson}
            pendingInvitation={pendingInvite ?? undefined}
            onDirtyChange={setManagementAccessDirty}
            onClose={closeManagementAccessEditor}
            onCompleted={async (updatedEmployee) => {
              if (updatedEmployee) syncEmployeeCaches(updatedEmployee);
              await refreshInvitations();
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.org.users(orgId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) }),
              ]);
            }}
          />
        </Modal>
      )}
      {managementAccessUnsavedChangesDialog}
      {showInviteModal && employee && orgId && org && (
        <InviteEmployeeModal
          employee={employee}
          orgId={orgId}
          orgName={org.name || "your organization"}
          pendingInvitation={pendingInvite ?? undefined}
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

      {showAddToScheduleModal && employee && orgId && (
        <AddManagementUserToScheduleModal
          orgId={orgId}
          person={employee}
          employee={employee}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={orgRoles}
          focusAreaLabel={org?.focusAreaLabel}
          certificationLabel={org?.certificationLabel}
          roleLabel={org?.roleLabel}
          onClose={() => setShowAddToScheduleModal(false)}
          onAdded={(updatedEmployee) => {
            syncEmployeeCaches(updatedEmployee);
            refreshDirectory();
            setShowAddToScheduleModal(false);
          }}
        />
      )}
    </>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="dg-type-field-title">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--dg-color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function formatOrganizationRole(role: OrganizationRole): string {
  return {
    user: "User",
    admin: "Admin",
    super_admin: "Super Admin",
    gridmaster: "Gridmaster",
  }[role];
}

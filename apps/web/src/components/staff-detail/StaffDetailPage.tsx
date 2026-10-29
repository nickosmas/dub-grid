"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
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
import { useLatestRef } from "@/hooks/useLatestRef";
import type { StepUpRun } from "@/hooks/useStepUpAction";
import { useSharedStepUp } from "@/hooks/useSharedStepUp";
import { useFocusAreaShiftsQuestion } from "@/hooks/useFocusAreaShiftsQuestion";
import { getStepUpMethod } from "@/features/account/client/step-up";
import {
  changedElsewhereMessage,
  canOffboardAtTier,
  correctionReasonLabel,
  isSelfAction,
  removedFocusAreaIds,
  SELF_ACTION_FORBIDDEN_MESSAGE,
  SelfActionForbiddenError,
} from "@dubgrid/domain";
import { useAuth } from "@/components/AuthProvider";
import {
  activateEmployee,
  reinstateEmployee,
  suspendEmployee,
  setEmployeeSuspendedUntil,
  setEmployeePlannedChange,
  plannedChangeToast,
  type PlannedChange,
  type SuspensionDates,
  deactivateEmployee,
  fetchEmployeeById,
  fetchEmployeeActivity,
  fetchEmployeeInvitations,
  fetchEmployeeShifts,
  updateEmployee,
  removeEmployee,
  setEmployeeReturnDate,
  EmployeeAccessDeniedError,
  EmployeeContactConflictError,
  EmployeeProfileConflictError,
  FocusAreaShiftsCancelledError,
  EmployeeStatusConflictError,
} from "@/features/employees/client";
import { queryKeys } from "@/lib/query-keys";
import {
  mergeEmployeeIntoDirectoryPerson,
  upsertEmployeeInList,
  withKnownJoinedDate,
} from "@/lib/staff-directory";
import { isCurrentUsersEmployee } from "@/lib/profile-links";
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
  EmployeeActivityEntry,
} from "@/types";
import {
  fetchCorrections,
  fetchRecurringShifts,
  fetchScheduleNotes,
} from "@/features/schedule/client";
import {
  createOrganizationInvitation,
  replaceOrganizationInvitationAccessGuarded,
  resendInvitation,
  revokeInvitation,
  updateOrganizationMembershipGuarded,
} from "@/features/organization/client";
import { formatClientErrorMessage } from "@/lib/client-facing";
import EditEmployeePanel, { type EditEmployeePanelHandle } from "@/components/EditEmployeePanel";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS, getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { SpanTabs } from "@/components/ui/span-tabs";
import { useClipTrailingWhitespace } from "@/hooks/useClipTrailingWhitespace";
import { usePersonPeriod } from "@/hooks/usePersonPeriod";
import { formatPersonPeriodPhrase } from "@/lib/person-period";
import { PersonPeriodControl } from "./PersonPeriodControl";
import { StaffPageHeader } from "./StaffPageHeader";
import { PersonPager } from "./PersonPager";
import { findNeighbors, readPeopleOrder } from "@/lib/people-order";
import { ContactCard, WorkDetailsCard } from "./PersonInfoCards";
import { EmployeeStatusActions, StatusCardActions } from "./EmployeeStatusActions";
import { EmployeeStatusCard } from "./EmployeeStatusCard";
import { StaffOverviewTab } from "./tabs/StaffOverviewTab";
import { ShiftsTab } from "./tabs/ShiftsTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { AccessTab } from "./tabs/AccessTab";
import { RecurringTab } from "./tabs/RecurringTab";
import { PersonRecordCard } from "./PersonRecordCard";
import { getPersonAccountState } from "@/lib/person-account-state";

interface StaffDetailPageProps {
  employeeId: string;
}

export type StaffPageTab = "overview" | "shifts" | "recurring" | "access" | "activity";

const TAB_LABELS: Record<StaffPageTab, string> = {
  overview: "Overview",
  shifts: "Shifts",
  recurring: "Recurring",
  access: "Access",
  activity: "Activity",
};

/** The tab an old `?section=` link meant, from before the page had tabs. */
function tabForLegacySection(section: string): StaffPageTab {
  return section === "activity" ? "activity" : "overview";
}

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
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [detailsSaveBlocked, setDetailsSaveBlocked] = useState(false);
  const detailsEditorRef = useRef<EditEmployeePanelHandle>(null);
  const contentScrollerRef = useClipTrailingWhitespace();
  const {
    period,
    setPreset: setPeriodPreset,
    setCustomRange: setPeriodRange,
  } = usePersonPeriod(org?.payPeriodStartDate);
  const periodRange = useMemo(
    () => ({ ...period.range, phrase: formatPersonPeriodPhrase(period) }),
    [period],
  );

  const orgId = perms.orgId ?? org?.id ?? null;
  const overviewRange = useMemo(
    () => getProfileOverviewDateRange(new Date(), org?.timezone),
    [org?.timezone],
  );
  const { directory } = useDirectory(orgId);
  // Your own record opens your profile, so the arrows step over it.
  const ownEmployeeId = useMemo(
    () => directory.find((entry) => currentUser?.id && entry.userId === currentUser.id)?.employeeId,
    [currentUser?.id, directory],
  );
  const neighbors = useMemo(() => {
    if (!orgId) return null;
    const ids = readPeopleOrder(orgId);
    return ids
      ? findNeighbors(ids, employeeId, new Set(ownEmployeeId ? [ownEmployeeId] : []))
      : null;
  }, [employeeId, orgId, ownEmployeeId]);
  const queryClient = useQueryClient();
  // Label maps are rebuilt whenever the org bootstrap refetches in the
  // background. Read them through refs so that never restarts this page's
  // load, which used to blank an already-rendered profile a second time.
  const assignmentLabelMapRef = useLatestRef(assignmentLabelMap);
  const absenceTypeMapRef = useLatestRef(absenceTypeMap);
  const currentUserIdRef = useLatestRef(currentUser?.id ?? null);

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
  // Re-derived on a slow tick so an invitation that expires while the page is
  // open stops reading as pending, as the People table does.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const pendingInvite = useMemo(() => {
    return (
      invitations.find((i) => !i.acceptedAt && !i.revokedAt && Date.parse(i.expiresAt) > nowMs) ??
      null
    );
  }, [invitations, nowMs]);
  const accountState = useMemo(
    () => (employee ? getPersonAccountState(employee, invitations, nowMs) : null),
    [employee, invitations, nowMs],
  );
  const expiredInvite =
    accountState?.kind === "expired"
      ? (invitations.find((invitation) => invitation.id === accountState.invitationId) ?? null)
      : null;

  // Same gate as the route: the ledger's read policy plus this page's own
  // details permission. Keyed under `queryKeys.org.auditLog(orgId)` so the
  // audit_log and role_change_log realtime invalidations refresh it.
  const canViewActivity =
    perms.isGridmaster ||
    perms.isSuperAdmin ||
    (perms.role === "admin" && perms.canViewEmployeeDetails);
  const activityQuery = useQuery<EmployeeActivityEntry[]>({
    queryKey: orgId
      ? [...queryKeys.org.auditLog(orgId), "employee", employeeId]
      : ["org", "anon", "auditLog", "employee", employeeId],
    queryFn: () => fetchEmployeeActivity(orgId!, employeeId),
    enabled: Boolean(orgId) && !perms.isLoading && canViewActivity,
  });

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
        // Your own record lives at /profile. In-app links already go there;
        // this covers a typed URL without a separate lookup in front of the page.
        if (isCurrentUsersEmployee(emp.userId, currentUserIdRef.current)) {
          router.replace("/profile");
          return;
        }
        setEmployee(emp);

        // Fetch the rest in parallel
        const [empShifts, recShifts] = await Promise.all([
          fetchEmployeeShifts(
            employeeId,
            orgId,
            assignmentLabelMapRef.current,
            absenceTypeMapRef.current,
            overviewRange.startDate,
            overviewRange.endDate,
          ),
          perms.canViewRecurringShifts
            ? fetchRecurringShifts(
                orgId,
                employeeId,
                assignmentLabelMapRef.current,
                false,
                absenceTypeMapRef.current,
              )
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
    absenceTypeMapRef,
    assignmentLabelMapRef,
    currentUserIdRef,
    perms.canViewEmployeeDetails,
    perms.canViewRecurringShifts,
    perms.isGridmaster,
    perms.isLoading,
    router,
    overviewRange.endDate,
    overviewRange.startDate,
  ]);

  useEffect(() => {
    setEmployee(null);
    setIsEditingManagementAccess(false);
    setShowInviteModal(false);
    setShowAddToScheduleModal(false);
    setIsEditingDetails(false);
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

      setEmployee((current) =>
        current?.id === updatedEmployee.id
          ? withKnownJoinedDate(current, updatedEmployee)
          : updatedEmployee,
      );
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

  const { optionsFor: focusAreaSaveOptions, dialog: focusAreaDialog } =
    useFocusAreaShiftsQuestion();

  const handleSaveEmployee = useCallback(
    async (updatedEmployee: Employee) => {
      if (!orgId || !employee) return;
      const previousEmployee = employee;
      const revokedInvitationEmail =
        pendingInvite && (previousEmployee.email || "") !== (updatedEmployee.email || "")
          ? pendingInvite.email
          : null;
      // A save that may ask about their shifts waits for the answer, so Cancel
      // leaves the form as it was edited.
      if (
        removedFocusAreaIds(previousEmployee.focusAreaIds, updatedEmployee.focusAreaIds).length ===
        0
      ) {
        setEmployee(updatedEmployee);
      }
      try {
        const savedEmployee = await updateEmployee(
          updatedEmployee,
          orgId,
          previousEmployee.version,
          focusAreaSaveOptions(`${updatedEmployee.firstName} ${updatedEmployee.lastName}`),
        );
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
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their details"));
          return;
        }
        setEmployee(previousEmployee);
        // Closing the question about their shifts leaves the form open, unsaved.
        if (err instanceof FocusAreaShiftsCancelledError) return false;
        toast.error(
          err instanceof EmployeeContactConflictError
            ? formatClientErrorMessage(err, "We couldn't save those details. Try again.")
            : "We couldn't save those details. Try again.",
        );
      }
    },
    [
      employee,
      focusAreaSaveOptions,
      orgId,
      pendingInvite,
      refreshDirectory,
      refreshInvitations,
      syncEmployeeCaches,
    ],
  );

  // Chosen from EditEmployeePanel's confirm dialog when the admin picks
  // "Save & Send" after changing the email while a pending invitation
  // exists. Saves the identity change (the DB trigger revokes the old
  // invitation as a side effect), then creates and sends a replacement
  // invitation at the new address, reusing the old one's role/departments.
  const handleSaveEmployeeWithReinvite = useCallback(
    async (updatedEmployee: Employee, oldInvitation: Invitation, runStepUp: StepUpRun) => {
      if (!orgId || !employee) return;
      const previousEmployee = employee;
      // A save that may ask about their shifts waits for the answer, so Cancel
      // leaves the form as it was edited.
      if (
        removedFocusAreaIds(previousEmployee.focusAreaIds, updatedEmployee.focusAreaIds).length ===
        0
      ) {
        setEmployee(updatedEmployee);
      }

      let savedEmployee: Employee;
      try {
        savedEmployee = await updateEmployee(
          updatedEmployee,
          orgId,
          previousEmployee.version,
          focusAreaSaveOptions(`${updatedEmployee.firstName} ${updatedEmployee.lastName}`),
        );
        syncEmployeeCaches(savedEmployee);
      } catch (err) {
        if (err instanceof EmployeeProfileConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their details"));
          return;
        }
        setEmployee(previousEmployee);
        if (err instanceof FocusAreaShiftsCancelledError) return false;
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
        const completed = await runStepUp((accessToken) =>
          createOrganizationInvitation(
            {
              email: savedEmployee.email,
              role: oldInvitation.roleToAssign,
              orgId,
              employeeId: savedEmployee.id,
              firstName: savedEmployee.firstName,
              lastName: savedEmployee.lastName,
              phone: savedEmployee.phone || undefined,
              departmentIds: oldInvitation.departmentIds,
              deptAdminIds: oldInvitation.deptAdminIds,
            },
            accessToken,
          ),
        );
        if (!completed) {
          // The address change already revoked the old invitation.
          toast.info("Employee saved. No new invitation was sent.");
          return;
        }

        toast.success(`Employee saved. A new invitation was sent to ${savedEmployee.email}.`);
      } catch (err) {
        // Saving the new address revoked the old invitation, and a failed send
        // leaves no new one, so point at the one action that recovers.
        Sentry.captureException(err);
        toast.error(
          "Employee saved, but we couldn't send the new invitation. Use Send invitation to try again.",
        );
      } finally {
        refreshDirectory();
        void refreshInvitations();
      }
    },
    [
      employee,
      focusAreaSaveOptions,
      orgId,
      org?.name,
      refreshDirectory,
      refreshInvitations,
      syncEmployeeCaches,
    ],
  );

  // ── Status action handlers ──────────────────────────────────────────────────
  // Only an impersonating Gridmaster is asked for fresh proof (F-96).
  const statusStepUp = useSharedStepUp();
  const runStatusChange = (action: (accessToken?: string) => Promise<boolean>) =>
    statusStepUp.run(action).catch((err) => {
      toast.error(formatClientErrorMessage(err, "We couldn't update their status. Try again."));
    });

  const handleDeactivate = useCallback(
    async (
      empId: string,
      note?: string,
      accessToken?: string,
      returnDate?: string,
      absenceTypeId?: number | null,
      startDate?: string,
    ) => {
      if (!orgId || !employee) return false;
      // A planned Away (51g1) leaves them Active, so only the saved row shows it.
      if (!startDate)
        setEmployee((prev) =>
          prev
            ? {
                ...prev,
                status: "inactive" as const,
                statusNote: note ?? "",
                awayUntil: returnDate ?? null,
                awayAbsenceTypeId: returnDate ? (absenceTypeId ?? null) : null,
                statusChangedAt: new Date().toISOString(),
              }
            : prev,
        );
      try {
        const updatedEmployee = await (returnDate || startDate
          ? deactivateEmployee(
              empId,
              note,
              orgId,
              employee.version,
              accessToken,
              returnDate,
              absenceTypeId,
              startDate,
            )
          : deactivateEmployee(empId, note, orgId, employee.version, accessToken));
        syncEmployeeCaches(updatedEmployee);
        toast.success(updatedEmployee.plannedStatus ? "Away scheduled" : "Marked away");
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        // Revert on failure
        if (!startDate)
          setEmployee((prev) =>
            prev
              ? {
                  ...prev,
                  status: "active" as const,
                  statusNote: "",
                  awayUntil: null,
                  awayAbsenceTypeId: null,
                }
              : prev,
          );
        if (getStepUpMethod(err)) throw err;
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return false;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't update their status. Try again."));
        return false;
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleActivate = useCallback(
    async (empId: string, startDate?: string) => {
      if (!orgId || !employee) return;
      if (startDate) {
        try {
          syncEmployeeCaches(await activateEmployee(empId, orgId, employee.version, startDate));
          toast.success("Restore scheduled");
        } catch (err) {
          if (err instanceof EmployeeStatusConflictError) {
            syncEmployeeCaches(err.latestEmployee);
            toast.error(changedElsewhereMessage("their status"));
            return;
          }
          toast.error(
            formatClientErrorMessage(err, "We couldn't schedule the restore. Try again."),
          );
        }
        return;
      }
      const prevStatus = employee?.status;
      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              status: "active" as const,
              statusNote: "",
              awayUntil: null,
              statusChangedAt: new Date().toISOString(),
            }
          : prev,
      );
      try {
        const updatedEmployee = await activateEmployee(empId, orgId, employee.version);
        syncEmployeeCaches(updatedEmployee);
        toast.success(prevStatus === "removed" ? "Restored" : "Marked active");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        setEmployee((prev) => (prev ? { ...prev, status: prevStatus ?? "inactive" } : prev));
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return;
        }
        toast.error("We couldn't change their status. Try again.");
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleSuspend = useCallback(
    async (empId: string, accessToken?: string, dates?: SuspensionDates) => {
      if (!orgId || !employee) return false;
      try {
        const updated = await suspendEmployee(empId, orgId, employee.version, accessToken, dates);
        syncEmployeeCaches(updated);
        toast.success(updated.suspendedAt ? "Suspended" : "Suspension scheduled");
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        if (getStepUpMethod(err)) throw err;
        toast.error(formatClientErrorMessage(err, "We couldn't suspend them. Try again."));
        return false;
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleSetPlannedChange = useCallback(
    async (empId: string, plan: PlannedChange | null, accessToken?: string) => {
      if (!orgId || !employee) return false;
      try {
        syncEmployeeCaches(
          await setEmployeePlannedChange(empId, orgId, employee.version, plan, accessToken),
        );
        toast.success(plannedChangeToast(plan, employee.plannedStatus));
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        if (getStepUpMethod(err)) throw err;
        toast.error(
          formatClientErrorMessage(err, "We couldn't save their planned time away. Try again."),
        );
        return false;
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleSetSuspendedUntil = useCallback(
    async (empId: string, until: string | null) => {
      if (!orgId || !employee) return;
      try {
        syncEmployeeCaches(await setEmployeeSuspendedUntil(empId, orgId, employee.version, until));
        toast.success(until ? "End date saved" : "End date cleared");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't save the end date. Try again."));
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleReinstate = useCallback(
    async (empId: string) => {
      if (!orgId || !employee) return;
      try {
        syncEmployeeCaches(await reinstateEmployee(empId, orgId, employee.version));
        toast.success("Reinstated");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't reinstate them. Try again."));
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleSetReturnDate = useCallback(
    async (empId: string, returnDate: string | null, absenceTypeId?: number | null) => {
      if (!orgId || !employee) return;
      try {
        const updatedEmployee = await setEmployeeReturnDate(
          empId,
          orgId,
          employee.version,
          returnDate,
          absenceTypeId ?? null,
        );
        syncEmployeeCaches(updatedEmployee);
        toast.success(returnDate ? "Return date saved" : "Return date cleared");
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't save the return date. Try again."));
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

  const handleRemove = useCallback(
    async (empId: string, note?: string, accessToken?: string, lastDay?: string) => {
      if (!orgId || !employee) return false;
      const prevStatus = employee?.status;
      // A last day keeps them as they are until the day after it (51g2).
      if (!lastDay) {
        setEmployee((prev) =>
          prev
            ? { ...prev, status: "removed" as const, statusChangedAt: new Date().toISOString() }
            : prev,
        );
      }
      try {
        const updatedEmployee = await (lastDay
          ? removeEmployee(empId, orgId, employee.version, note, accessToken, lastDay)
          : removeEmployee(empId, orgId, employee.version, note, accessToken));
        syncEmployeeCaches(updatedEmployee);
        toast.success(lastDay ? "Last day set" : "Offboarded");
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          syncEmployeeCaches(err.latestEmployee);
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        setEmployee((prev) => (prev ? { ...prev, status: prevStatus ?? "active" } : prev));
        if (getStepUpMethod(err)) throw err;
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return false;
        }
        toast.error("We couldn't offboard them. Try again.");
        return false;
      }
    },
    [employee, orgId, syncEmployeeCaches],
  );

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
  const showScheduleDetails = !directoryPerson?.isManagementUser || isOnSchedule;
  const availableTabs = useMemo<StaffPageTab[]>(
    () => [
      "overview",
      "shifts",
      ...(perms.canViewRecurringShifts ? (["recurring"] as const) : []),
      "access",
      ...(canViewActivity ? (["activity"] as const) : []),
    ],
    [canViewActivity, perms.canViewRecurringShifts],
  );
  const legacySection = searchParams.get("section");
  const requestedTab = searchParams.get("tab");
  const activeTab: StaffPageTab = availableTabs.includes(requestedTab as StaffPageTab)
    ? (requestedTab as StaffPageTab)
    : "overview";
  const hrefForTab = useCallback(
    (tab: StaffPageTab) =>
      tab === "overview" ? `/people/${employeeId}` : `/people/${employeeId}?tab=${tab}`,
    [employeeId],
  );
  useEffect(() => {
    if (legacySection) router.replace(hrefForTab(tabForLegacySection(legacySection)));
  }, [hrefForTab, legacySection, router]);

  // The Overview counts the chosen period, loaded on its own so a long custom
  // range never rides on the page's first load.
  const periodShiftsQuery = useQuery<ShiftMap>({
    queryKey: orgId
      ? [
          ...queryKeys.shifts.all(orgId),
          "employee",
          employeeId,
          period.range.startDate,
          period.range.endDate,
        ]
      : ["shifts", "anon", "employee", employeeId],
    queryFn: () =>
      fetchEmployeeShifts(
        employeeId,
        orgId!,
        assignmentLabelMapRef.current,
        absenceTypeMapRef.current,
        period.range.startDate,
        period.range.endDate,
      ),
    enabled:
      Boolean(orgId) && Boolean(employee) && (activeTab === "overview" || activeTab === "shifts"),
  });
  const canSeeCorrections = Boolean(
    perms.isGridmaster || perms.isSuperAdmin || perms.canEditShifts,
  );
  const correctionsQuery = useQuery({
    queryKey: orgId
      ? [
          ...queryKeys.shifts.all(orgId),
          "corrections",
          period.range.startDate,
          period.range.endDate,
        ]
      : ["shifts", "anon", "corrections"],
    queryFn: () => fetchCorrections(orgId!, period.range.startDate, period.range.endDate),
    enabled: Boolean(orgId) && activeTab === "shifts" && canSeeCorrections,
  });
  const canSeeNotes = Boolean(perms.isGridmaster || perms.isSuperAdmin || perms.canViewSchedule);
  const notesQuery = useQuery({
    queryKey: orgId
      ? [...queryKeys.shifts.all(orgId), "notes", period.range.startDate, period.range.endDate]
      : ["shifts", "anon", "notes"],
    queryFn: () => fetchScheduleNotes(orgId!, period.range.startDate, period.range.endDate),
    enabled: Boolean(orgId) && activeTab === "shifts" && canSeeNotes,
  });
  const correctionsByDate = useMemo(
    () =>
      new Map(
        (correctionsQuery.data ?? [])
          .filter((correction) => correction.empId === employeeId)
          .map((correction) => [
            correction.date,
            correction.reason ? correctionReasonLabel(correction.reason) : null,
          ]),
      ),
    [correctionsQuery.data, employeeId],
  );
  const noteCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notesQuery.data ?? []) {
      if (note.empId === employeeId) counts.set(note.date, (counts.get(note.date) ?? 0) + 1);
    }
    return counts;
  }, [employeeId, notesQuery.data]);
  const shiftRecordLookups = useMemo(
    () => ({
      assignmentById,
      shiftById: categoryById,
      jobById: new Map(jobs.map((job) => [job.id, job])),
      focusAreaById: new Map(focusAreas.map((area) => [area.id, area])),
      absenceById: new Map(absenceTypes.map((absence) => [absence.id, absence])),
    }),
    [absenceTypes, assignmentById, categoryById, focusAreas, jobs],
  );
  const currentWeekDates = useMemo(
    () => getProfileOverviewCurrentWeekDateKeys(overviewRange),
    [overviewRange],
  );

  const closeDetailsEditor = useCallback(() => {
    setDetailsDirty(false);
    setIsEditingDetails(false);
  }, []);
  const { requestClose: requestDetailsClose, unsavedChangesDialog: detailsUnsavedChangesDialog } =
    useUnsavedChangesPrompt({ hasUnsavedChanges: detailsDirty, onDiscard: closeDetailsEditor });
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

  // Reinvite rotates the token on the same pending invitation. Revoking it and
  // opening the invite modal instead minted a second invitation for one click.
  const handleResendInvitation = useCallback(
    async (invitationId: string) => {
      if (!orgId) return false;
      try {
        await resendInvitation(invitationId, orgId);
        await refreshInvitations();
        refreshDirectory();
        toast.success("Invitation resent");
        return true;
      } catch (err) {
        toast.error(
          formatClientErrorMessage(err, "We couldn't resend that invitation. Try again."),
        );
        return false;
      }
    },
    [orgId, refreshDirectory, refreshInvitations],
  );

  const handlePermissionsChange = useCallback(
    async (perms: AdminPermissions, accessToken?: string) => {
      if (!orgId || !directoryPerson?.userId || !directoryPerson?.membershipUpdatedAt) return;
      const updatedMembership = await updateOrganizationMembershipGuarded(
        {
          orgId,
          userId: directoryPerson.userId,
          expectedUpdatedAt: directoryPerson.membershipUpdatedAt,
          adminPermissions: perms,
        },
        accessToken,
      );
      syncDirectoryMembership(updatedMembership);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org.users(orgId) }),
      ]);
    },
    [orgId, directoryPerson, queryClient, syncDirectoryMembership],
  );

  const handleRoleChange = useCallback(
    async (role: OrganizationRole, accessToken?: string) => {
      if (!orgId || !directoryPerson) return;
      if (!directoryPerson.userId) {
        if (!pendingInvite?.updatedAt) return;
        await replaceOrganizationInvitationAccessGuarded(
          {
            orgId,
            invitationId: pendingInvite.id,
            expectedUpdatedAt: pendingInvite.updatedAt,
            roleToAssign: role,
          },
          accessToken,
        );
        await refreshInvitations();
        refreshDirectory();
        return;
      }
      if (!directoryPerson.membershipUpdatedAt) return;
      const updatedMembership = await updateOrganizationMembershipGuarded(
        {
          orgId,
          userId: directoryPerson.userId,
          expectedUpdatedAt: directoryPerson.membershipUpdatedAt,
          orgRole: role,
        },
        accessToken,
      );
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

  const canOffboard = canOffboardAtTier(perms, effectiveOrgRole);
  const statusActions = (person: Employee, label?: string) =>
    label ? (
      <EmployeeStatusActions
        employee={person}
        canEdit={perms.canManageEmployees}
        canOffboard={canOffboard}
        isSelf={isSelfAction(currentUser?.id, person.userId)}
        onDeactivate={(empId, note, returnDate, absenceTypeId, startDate) =>
          runStatusChange((token) =>
            returnDate || startDate
              ? handleDeactivate(empId, note, token, returnDate, absenceTypeId, startDate)
              : handleDeactivate(empId, note, token),
          )
        }
        onActivate={handleActivate}
        onSetReturnDate={handleSetReturnDate}
        onReinstate={handleReinstate}
        onSuspend={(empId, dates) => runStatusChange((token) => handleSuspend(empId, token, dates))}
        onSetSuspendedUntil={handleSetSuspendedUntil}
        onSetPlannedChange={(empId, plan) =>
          runStatusChange((token) => handleSetPlannedChange(empId, plan, token))
        }
        absenceTypes={absenceTypes}
        onRemove={(empId, note, lastDay) =>
          runStatusChange((token) =>
            lastDay ? handleRemove(empId, note, token, lastDay) : handleRemove(empId, note, token),
          )
        }
        stepUpOpen={Boolean(statusStepUp.dialog)}
        variant="card"
        label={label}
        focus="plan"
      />
    ) : (
      <StatusCardActions
        employee={person}
        canEdit={perms.canManageEmployees}
        canOffboard={canOffboard}
        isSelf={isSelfAction(currentUser?.id, person.userId)}
        onDeactivate={(empId, note, returnDate, absenceTypeId, startDate) =>
          runStatusChange((token) =>
            returnDate || startDate
              ? handleDeactivate(empId, note, token, returnDate, absenceTypeId, startDate)
              : handleDeactivate(empId, note, token),
          )
        }
        onActivate={handleActivate}
        onSetReturnDate={handleSetReturnDate}
        onReinstate={handleReinstate}
        onSuspend={(empId, dates) => runStatusChange((token) => handleSuspend(empId, token, dates))}
        onSetSuspendedUntil={handleSetSuspendedUntil}
        onSetPlannedChange={(empId, plan) =>
          runStatusChange((token) => handleSetPlannedChange(empId, plan, token))
        }
        absenceTypes={absenceTypes}
        onRemove={(empId, note, lastDay) =>
          runStatusChange((token) =>
            lastDay ? handleRemove(empId, note, token, lastDay) : handleRemove(empId, note, token),
          )
        }
        stepUpOpen={Boolean(statusStepUp.dialog)}
      />
    );

  const canSendInvitation = Boolean(
    employee &&
    perms.canManageEmployees &&
    !pendingInvite &&
    !expiredInvite &&
    !employee.userId &&
    employee.email,
  );
  const canAddToManagement = Boolean(
    employee &&
    canManageManagementAccess &&
    !directoryPerson?.isManagementUser &&
    !hasPendingManagementInvite &&
    employee.status !== "removed",
  );
  const canAddToSchedule = Boolean(
    employee &&
    perms.canManageEmployees &&
    !isOnSchedule &&
    directoryPerson?.isManagementUser &&
    employee.userId,
  );
  const personName = (id: string) => {
    const person = directory.find((entry) => entry.employeeId === id);
    return person ? `${person.firstName} ${person.lastName}`.trim() : null;
  };
  const openPerson = (id: string) =>
    router.push(activeTab === "overview" ? `/people/${id}` : `/people/${id}?tab=${activeTab}`);
  const pager = neighbors ? (
    <PersonPager
      position={neighbors.position}
      total={neighbors.total}
      previous={
        neighbors.previousId
          ? {
              name: personName(neighbors.previousId),
              onOpen: () => openPerson(neighbors.previousId!),
            }
          : null
      }
      next={
        neighbors.nextId
          ? { name: personName(neighbors.nextId), onOpen: () => openPerson(neighbors.nextId!) }
          : null
      }
    />
  ) : null;
  const headerActions =
    pager || canSendInvitation || canAddToManagement || canAddToSchedule ? (
      <>
        {pager}
        {canSendInvitation && (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={() => setShowInviteModal(true)}
          >
            Send invitation
          </Button>
        )}
        {canAddToManagement && (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={() => setIsEditingManagementAccess(true)}
          >
            Add to management
          </Button>
        )}
        {canAddToSchedule && (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            onClick={() => setShowAddToScheduleModal(true)}
          >
            Add to schedule
          </Button>
        )}
      </>
    ) : null;

  const isLoading = loading || orgLoading || perms.isLoading;

  if (!perms.isLoading && !perms.canViewEmployeeDetails) {
    return <ProgressBar loading />;
  }

  if (error && !employee) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-var(--dg-app-shell-header-height))]">
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
      {statusStepUp.dialog}
      {focusAreaDialog}

      {/* A re-run of the load (permissions settling, a bootstrap refetch) keeps
          the rendered profile in place; only a first load shows nothing. */}
      {employee && org && (
        <div
          ref={contentScrollerRef}
          className="h-[calc(100dvh-var(--dg-app-shell-header-height))] overflow-y-auto px-[var(--dg-page-gutter)] py-4 md:py-6 xl:py-8"
        >
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
            <StaffPageHeader
              employee={employee}
              orgRole={effectiveOrgRole}
              actions={headerActions}
            />

            {/* Phones read the status first, then who they are, then the tabs; from
                1024px the cards sit in a column beside both. */}
            <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
              <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
                <EmployeeStatusCard
                  employee={employee}
                  absenceTypes={absenceTypes}
                  action={
                    perms.canManageEmployees && !isSelfAction(currentUser?.id, employee.userId)
                      ? statusActions(employee)
                      : undefined
                  }
                  planAction={
                    perms.canManageEmployees && !isSelfAction(currentUser?.id, employee.userId)
                      ? statusActions(employee, "Edit plan")
                      : undefined
                  }
                />

                {perms.canManageEmployees && pendingInvite && (
                  <PendingInvitationBanner
                    pendingInvitation={pendingInvite}
                    onReinvite={() => handleResendInvitation(pendingInvite.id)}
                    onRevoke={handleRevokeInvitation}
                  />
                )}
                {perms.canManageEmployees && !pendingInvite && expiredInvite && (
                  <PendingInvitationBanner
                    pendingInvitation={expiredInvite}
                    onReinvite={() => handleResendInvitation(expiredInvite.id)}
                    onRevoke={handleRevokeInvitation}
                    expired
                  />
                )}
              </div>

              <aside
                className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-1"
                aria-label="About them"
              >
                <ContactCard
                  employee={employee}
                  onEdit={canEditDetails ? () => setIsEditingDetails(true) : undefined}
                />
                <WorkDetailsCard
                  employee={employee}
                  focusAreas={focusAreas}
                  certifications={certifications}
                  roles={orgRoles}
                  focusAreaLabel={org?.focusAreaLabel}
                  certificationLabel={org?.certificationLabel}
                  roleLabel={org?.roleLabel}
                  showScheduleDetails={showScheduleDetails}
                  onEdit={canEditDetails ? () => setIsEditingDetails(true) : undefined}
                />
                {accountState && (
                  <PersonRecordCard
                    employee={employee}
                    accountState={accountState}
                    lastSignInAt={directoryPerson?.lastSignInAt}
                  />
                )}
              </aside>

              <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="max-w-full overflow-x-auto">
                    <SpanTabs<StaffPageTab>
                      aria-label="Person sections"
                      className="w-max"
                      items={availableTabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
                      value={activeTab}
                      onChange={(tab) => router.replace(hrefForTab(tab), { scroll: false })}
                    />
                  </div>
                  {(activeTab === "overview" ||
                    activeTab === "shifts" ||
                    activeTab === "activity") && (
                    <PersonPeriodControl
                      period={period}
                      payPeriodStartDate={org?.payPeriodStartDate}
                      onPresetChange={setPeriodPreset}
                      onCustomRangeChange={setPeriodRange}
                    />
                  )}
                </div>

                <section aria-label={TAB_LABELS[activeTab]}>
                  {activeTab === "overview" && (
                    <StaffOverviewTab
                      employee={employee}
                      periodShifts={periodShiftsQuery.data}
                      currentWeekShifts={shifts}
                      currentWeekDates={currentWeekDates}
                      range={period.range}
                      periodPhrase={periodRange.phrase}
                      assignments={assignments}
                      shiftCategories={shiftCategories}
                      jobs={jobs}
                      absenceTypes={absenceTypes}
                    />
                  )}
                  {activeTab === "shifts" && (
                    <ShiftsTab
                      employee={employee}
                      shifts={periodShiftsQuery.data}
                      loading={periodShiftsQuery.isPending}
                      range={period.range}
                      periodPhrase={periodRange.phrase}
                      lookups={shiftRecordLookups}
                      corrections={correctionsByDate}
                      noteCounts={noteCountsByDate}
                    />
                  )}
                  {activeTab === "recurring" && orgId && (
                    <RecurringTab
                      orgId={orgId}
                      employeeId={employee.id}
                      focusAreas={focusAreas}
                      recurringShifts={recurringShifts}
                      assignments={assignments}
                      absenceTypes={absenceTypes}
                      shiftCategories={shiftCategories}
                      jobs={jobs}
                    />
                  )}
                  {activeTab === "access" && (
                    <AccessTab
                      employee={employee}
                      orgRole={effectiveOrgRole}
                      directoryPerson={directoryPerson}
                      pendingInvitation={pendingInvite}
                      hasPendingManagementInvite={hasPendingManagementInvite}
                      departments={departments ?? []}
                      canManageManagementAccess={canManageManagementAccess}
                      canManageEmployees={perms.canManageEmployees}
                      isSelf={isSelfAction(currentUser?.id, employee.userId)}
                      labels={{
                        focusAreaLabel: org?.focusAreaLabel,
                        certificationLabel: org?.certificationLabel,
                        roleLabel: org?.roleLabel,
                      }}
                      onRoleChange={handleRoleChange}
                      onPermissionsChange={handlePermissionsChange}
                      onEditManagementAccess={() => setIsEditingManagementAccess(true)}
                      onInvite={canSendInvitation ? () => setShowInviteModal(true) : undefined}
                    />
                  )}
                  {activeTab === "activity" && (
                    <ActivityTab
                      employee={employee}
                      entries={activityQuery.data ?? []}
                      timeZone={org?.timezone ?? null}
                      range={periodRange}
                      loading={activityQuery.isPending}
                      error={
                        activityQuery.error
                          ? formatClientErrorMessage(
                              activityQuery.error,
                              "We couldn't load activity right now.",
                            )
                          : null
                      }
                    />
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditingDetails && employee && (
        <Modal
          title="Edit details"
          onClose={closeDetailsEditor}
          onRequestClose={requestDetailsClose}
          className="dg-modal--tight-header"
          style={{ maxWidth: 640, width: "100%" }}
          footer={
            <EditorActionRow
              secondaryAction={
                <Button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => detailsEditorRef.current?.requestDismiss()}
                >
                  {getEditorDismissLabel({ hasUnsavedChanges: detailsDirty })}
                </Button>
              }
              primaryAction={
                <Button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  disabled={!detailsDirty || detailsSaveBlocked}
                  onClick={() => void detailsEditorRef.current?.save()}
                >
                  {EDITOR_ACTION_LABELS.save}
                </Button>
              }
            />
          }
        >
          <EditEmployeePanel
            ref={detailsEditorRef}
            hideActions
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
            onSave={handleSaveEmployee}
            onSaveCompleted={closeDetailsEditor}
            onCancel={closeDetailsEditor}
            onDirtyChange={setDetailsDirty}
            onSaveBlockedChange={setDetailsSaveBlocked}
            pendingInvitation={pendingInvite ?? undefined}
            onSaveWithReinvite={handleSaveEmployeeWithReinvite}
          />
        </Modal>
      )}
      {detailsUnsavedChangesDialog}

      {isEditingManagementAccess && orgId && org && employee && (
        <EmployeeManagementAccessEditor
          employee={employee}
          orgId={orgId}
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
          frame={(fields, actions) => (
            <Modal
              title={
                directoryPerson?.isManagementUser || hasPendingManagementInvite
                  ? "Edit management access"
                  : "Add to management"
              }
              onClose={closeManagementAccessEditor}
              onRequestClose={requestManagementAccessClose}
              className="dg-modal--tight-header"
              style={{ maxWidth: 560, width: "100%" }}
              footer={actions}
            >
              {fields}
            </Modal>
          )}
        />
      )}
      {managementAccessUnsavedChangesDialog}
      {showInviteModal && employee && orgId && org && (
        <InviteEmployeeModal
          employee={employee}
          orgId={orgId}
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

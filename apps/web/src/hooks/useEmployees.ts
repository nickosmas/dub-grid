import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateEmployee,
  changeEmployeeStatuses,
  reinstateEmployee,
  suspendEmployee,
  setEmployeeSuspendedUntil,
  deactivateEmployee,
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  FocusAreaShiftsCancelledError,
  fetchEmployees,
  insertEmployee,
  removeEmployee,
  setEmployeePlannedChange,
  plannedChangeToast,
  setEmployeeReturnDate,
  saveSeniorityOrder,
  updateEmployee,
  type BulkStatusOutcome,
  type PlannedChange,
  type SuspensionDates,
  type UpdateEmployeeOptions,
} from "@/features/employees/client";
import { createOrganizationInvitation } from "@/features/organization/client";
import { getStepUpMethod } from "@/features/account/client/step-up";
import { toast } from "sonner";
import {
  changedElsewhereMessage,
  removedFocusAreaIds,
  SELF_ACTION_FORBIDDEN_MESSAGE,
  SelfActionForbiddenError,
  type BulkStatusAction,
} from "@dubgrid/domain";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { useOrgRealtimeInvalidation } from "@/hooks/useOrgRealtimeInvalidation";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { StepUpRun } from "@/hooks/useStepUpAction";
import type { Employee, Invitation } from "@/types";
import { replaceEmployeeRow } from "./employee-rows";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmployeesData {
  employees: Employee[];
  inactiveEmployees: Employee[];
  removedEmployees: Employee[];
  loading: boolean;
  handleAddEmployee: (
    dataList: Omit<Employee, "id" | "seniority">[],
  ) => Promise<Employee[] | undefined>;
  handleSaveEmployee: (emp: Employee) => Promise<boolean>;
  /** Saves a whole new seniority order at once; false when nothing changed. */
  handleSaveSeniorityOrder: (order: Employee[]) => Promise<boolean>;
  /** Saves an employee whose email just changed while a pending invitation
   *  exists, then creates and sends a replacement invitation at the new
   *  address (reusing the old invitation's role/departments). */
  handleSaveEmployeeWithReinvite: (
    emp: Employee,
    oldInvitation: Invitation,
    runStepUp: StepUpRun,
  ) => Promise<boolean>;
  /** A step-up refusal is rethrown (after the optimistic change is undone) for the caller to prompt. */
  handleRemoveEmployee: (
    empId: string,
    note?: string,
    accessToken?: string,
    lastDay?: string,
  ) => Promise<boolean>;
  handleDeactivateEmployee: (
    empId: string,
    note?: string,
    accessToken?: string,
    returnDate?: string | null,
    absenceTypeId?: number | null,
    /** A day after today plans the Away for then (51g1). */
    startDate?: string | null,
  ) => Promise<boolean>;
  /**
   * Moves or changes a planned Away, or cancels it (null). A step-up refusal
   * is rethrown for the caller to prompt.
   */
  handleSetPlannedChange: (
    empId: string,
    plan: PlannedChange | null,
    accessToken?: string,
  ) => Promise<boolean>;
  /** Restores or marks them active now, or with `startDate` (51l) restores them on that day. */
  handleActivateEmployee: (empId: string, startDate?: string) => Promise<void>;
  /** Gives a suspended person their access back (51c). */
  handleReinstateEmployee: (empId: string) => Promise<void>;
  /**
   * Suspends someone now or from a later start, until an end date when given
   * (51g3). A step-up refusal is rethrown for the caller to prompt.
   */
  handleSuspendEmployee: (
    empId: string,
    accessToken?: string,
    dates?: SuspensionDates,
  ) => Promise<boolean>;
  /** Sets, moves or clears (null) a suspended person's end date (51g3). */
  handleSetSuspendedUntil: (empId: string, until: string | null) => Promise<boolean>;
  /**
   * One status change for several people (51h): saved rows and refreshed
   * conflicts go into the list, with no toast per person. Resolves each
   * person's outcome; throws when the whole request was refused, a step-up
   * prompt included, for the caller to handle.
   */
  handleBulkStatusChange: (
    action: BulkStatusAction,
    empIds: readonly string[],
    options?: { note?: string; returnDate?: string | null },
    accessToken?: string,
  ) => Promise<BulkStatusOutcome[]>;
  /** Sets, moves or clears (null) an Away person's return date and the absence their days hold. */
  handleSetEmployeeReturnDate: (
    empId: string,
    returnDate: string | null,
    absenceTypeId?: number | null,
  ) => Promise<boolean>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/** Every employee of the organization; shared with the sign-in prefetch. */
export function employeesQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: queryKeys.employees.all(orgId),
    queryFn: () => fetchEmployees(orgId, ["active", "inactive", "removed"]),
    staleTime: 2 * 60_000, // 2 min — mutations invalidate immediately
  });
}

function mayAskAboutShifts(rows: readonly Employee[], emp: Employee): boolean {
  const previous = rows.find((row) => row.id === emp.id);
  return previous ? removedFocusAreaIds(previous.focusAreaIds, emp.focusAreaIds).length > 0 : false;
}

export interface UseEmployeesOptions {
  /** How a save of this person asks about their shifts in focus areas they come off (51i). */
  saveOptionsFor?: (emp: Employee) => UpdateEmployeeOptions;
}

export function useEmployees(
  orgId: string | null,
  options: UseEmployeesOptions = {},
): EmployeesData {
  const queryClient = useQueryClient();
  const saveOptionsForRef = useLatestRef(options.saveOptionsFor);

  // Subscribe to org-wide CDC so adds/edits made elsewhere (e.g. /people in
  // another tab, or another step in the onboarding wizard) invalidate this
  // hook's `employees.all` query and refetch automatically.
  useOrgRealtimeInvalidation({ orgId, queryClient });

  const employeesQuery = useQuery({ ...employeesQueryOptions(orgId!), enabled: !!orgId });

  // Single local state for optimistic updates. Synced from query data,
  // mutated optimistically by handlers, rolled back on error.
  const [allLocal, setAllLocal] = useState<Employee[]>([]);

  // Sync from query data during render (1 setState instead of 4).
  const [syncedData, setSyncedData] = useState<Employee[] | undefined>(undefined);
  if (employeesQuery.data && employeesQuery.data !== syncedData) {
    setSyncedData(employeesQuery.data);
    setAllLocal(employeesQuery.data);
  }

  // Derive filtered arrays — no extra re-renders, no separate state.
  const employees = useMemo(() => allLocal.filter((e) => e.status === "active"), [allLocal]);
  const inactiveEmployees = useMemo(
    () => allLocal.filter((e) => e.status === "inactive"),
    [allLocal],
  );
  const removedEmployees = useMemo(
    () => allLocal.filter((e) => e.status === "removed"),
    [allLocal],
  );

  const loading = employeesQuery.isLoading;

  // Latest employee list, for reading inside optimistic callbacks.
  const allEmployeesRef = useLatestRef(allLocal);

  // Helper: invalidate the all-employees query so the next focus/navigation
  // picks up any server-side changes.
  const invalidateEmployees = useCallback(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.org.employeeCount(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
      broadcastInvalidation(queryKeys.employees.all(orgId));
      broadcastInvalidation(queryKeys.org.employeeCount(orgId));
      broadcastInvalidation(queryKeys.org.directory(orgId));
    }
  }, [queryClient, orgId]);

  const handleAddEmployee = useCallback(
    async (dataList: Omit<Employee, "id" | "seniority">[]) => {
      if (!orgId) return;
      const added: Employee[] = [];
      try {
        for (const data of dataList) {
          const maxSen = Math.max(
            ...allEmployeesRef.current.map((e) => e.seniority),
            ...added.map((e) => e.seniority),
            0,
          );
          const newEmp = await insertEmployee({ ...data, seniority: maxSen + 1 }, orgId);
          added.push(newEmp);
        }
        setAllLocal((prev) => [...prev, ...added]);
        toast.success(added.length === 1 ? "Employee added" : `${added.length} employees added`);
        invalidateEmployees();
        return added;
      } catch (err) {
        Sentry.captureException(err);
        if (added.length === 0) {
          toast.error(formatClientErrorMessage(err, "We couldn't add that person. Try again."));
          return undefined;
        }
        // Rows are inserted one at a time, so some may already exist. Show
        // them, and close the form rather than let a retry add them twice.
        setAllLocal((prev) => [...prev, ...added]);
        invalidateEmployees();
        toast.error(`Added ${added.length} of ${dataList.length} employees. Add the rest again.`);
        return added;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSaveEmployee = useCallback(
    async (emp: Employee) => {
      if (!orgId) return false;
      // Read the pre-update snapshot from the ref (synchronous, updated
      // during render) rather than capturing it inside the optimistic
      // setAllLocal's updater closure below — that updater isn't guaranteed
      // to run before this async function's next line reads it, so a
      // rollback could fire with the closure variable still at its initial
      // value and wipe the list instead of restoring it.
      const prevAll = allEmployeesRef.current;
      // A save that may ask about their shifts waits for the answer: showing it
      // early and rolling it back on Cancel would reset the open form.
      if (!mayAskAboutShifts(prevAll, emp)) {
        setAllLocal((prev) => replaceEmployeeRow(prev, emp));
      }
      try {
        const savedEmployee = await updateEmployee(
          emp,
          orgId,
          emp.version,
          saveOptionsForRef.current?.(emp),
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, savedEmployee));
        // One id, so a reorder's many saves show one toast.
        toast.success("Employee saved", { id: "employee-saved" });
        invalidateEmployees();
        return true;
      } catch (err) {
        // On version conflict, swap in the server's latest copy instead of
        // rolling back to pre-edit state — that way the user sees what
        // actually exists and can re-edit from the real current row.
        if (err instanceof EmployeeProfileConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their details"));
          return false;
        }
        // Restore only this row: a reorder saves many rows at once, and the
        // others may have succeeded.
        const previous = prevAll.find((row) => row.id === emp.id);
        if (previous) {
          setAllLocal((prev) => prev.map((row) => (row.id === emp.id ? previous : row)));
        }
        if (err instanceof FocusAreaShiftsCancelledError) return false;
        toast.error(formatClientErrorMessage(err, "We couldn't save their details. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSaveSeniorityOrder = useCallback(
    async (order: Employee[]) => {
      if (!orgId) return false;
      const prevAll = allEmployeesRef.current;
      const moves = order.flatMap((emp, index) =>
        emp.seniority === index + 1
          ? []
          : [{ id: emp.id, seniority: index + 1, version: emp.version }],
      );
      if (moves.length === 0) return true;
      const nextSeniority = new Map(moves.map((move) => [move.id, move.seniority]));
      setAllLocal((prev) =>
        prev.map((row) =>
          nextSeniority.has(row.id) ? { ...row, seniority: nextSeniority.get(row.id)! } : row,
        ),
      );
      try {
        const saved = await saveSeniorityOrder(orgId, moves);
        const savedById = new Map(saved.map((emp) => [emp.id, emp]));
        setAllLocal((prev) => prev.map((row) => savedById.get(row.id) ?? row));
        toast.success("Order saved");
        invalidateEmployees();
        return true;
      } catch (err) {
        // The server saves all of it or none of it, so the whole list goes back.
        setAllLocal(prevAll);
        toast.error(
          formatClientErrorMessage(
            err,
            "We couldn't save the new order, so nothing changed. Try again.",
          ),
        );
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSaveEmployeeWithReinvite = useCallback(
    async (emp: Employee, oldInvitation: Invitation, runStepUp: StepUpRun) => {
      if (!orgId) return false;
      const prevAll = allEmployeesRef.current;
      // A save that may ask about their shifts waits for the answer: showing it
      // early and rolling it back on Cancel would reset the open form.
      if (!mayAskAboutShifts(prevAll, emp)) {
        setAllLocal((prev) => replaceEmployeeRow(prev, emp));
      }

      let savedEmployee: Employee;
      try {
        savedEmployee = await updateEmployee(
          emp,
          orgId,
          emp.version,
          saveOptionsForRef.current?.(emp),
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, savedEmployee));
        invalidateEmployees();
      } catch (err) {
        if (err instanceof EmployeeProfileConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their details"));
          return false;
        }
        setAllLocal(prevAll);
        if (err instanceof FocusAreaShiftsCancelledError) return false;
        toast.error(formatClientErrorMessage(err, "We couldn't save their details. Try again."));
        Sentry.captureException(err);
        return false;
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
          return true;
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
        invalidateEmployees();
      }
      return true;
    },
    [orgId, invalidateEmployees],
  );

  const handleRemoveEmployee = useCallback(
    async (empId: string, note?: string, accessToken?: string, lastDay?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;

      const now = new Date().toISOString();
      const prevAll = allEmployeesRef.current;
      // A last day keeps them as they are until the day after it (51g2).
      if (!lastDay) {
        setAllLocal((prev) =>
          prev.map((e) =>
            e.id === empId ? { ...e, status: "removed" as const, statusChangedAt: now } : e,
          ),
        );
      }
      try {
        const updatedEmployee = await (lastDay
          ? removeEmployee(empId, orgId, targetEmployee.version, note, accessToken, lastDay)
          : removeEmployee(empId, orgId, targetEmployee.version, note, accessToken));
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(lastDay ? "Last day set" : "Offboarded");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        setAllLocal(prevAll);
        if (getStepUpMethod(err)) throw err;
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return false;
        }
        toast.error("We couldn't offboard them. Try again.");
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleDeactivateEmployee = useCallback(
    async (
      empId: string,
      note?: string,
      accessToken?: string,
      returnDate?: string | null,
      absenceTypeId?: number | null,
      startDate?: string | null,
    ) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;

      const prevAll = allEmployeesRef.current;
      // A planned Away leaves them Active, so only the saved row shows it.
      if (!startDate)
        setAllLocal((prev) =>
          prev.map((e) =>
            e.id === empId
              ? {
                  ...e,
                  status: "inactive" as const,
                  statusNote: note ?? "",
                  awayUntil: returnDate ?? null,
                  awayAbsenceTypeId: returnDate ? (absenceTypeId ?? null) : null,
                  statusChangedAt: new Date().toISOString(),
                }
              : e,
          ),
        );
      try {
        const updatedEmployee = await (returnDate || startDate
          ? deactivateEmployee(
              empId,
              note,
              orgId,
              targetEmployee.version,
              accessToken,
              returnDate,
              absenceTypeId,
              startDate,
            )
          : deactivateEmployee(empId, note, orgId, targetEmployee.version, accessToken));
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(updatedEmployee.plannedStatus ? "Away scheduled" : "Marked away");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        setAllLocal(prevAll);
        if (getStepUpMethod(err)) throw err;
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return false;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't update their status. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSetPlannedChange = useCallback(
    async (empId: string, plan: PlannedChange | null, accessToken?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;
      try {
        const updatedEmployee = await setEmployeePlannedChange(
          empId,
          orgId,
          targetEmployee.version,
          plan,
          accessToken,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(plannedChangeToast(plan, targetEmployee.plannedStatus));
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        if (getStepUpMethod(err)) throw err;
        toast.error(
          formatClientErrorMessage(err, "We couldn't save their planned time away. Try again."),
        );
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSuspendEmployee = useCallback(
    async (empId: string, accessToken?: string, dates?: SuspensionDates) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;
      try {
        const updatedEmployee = await suspendEmployee(
          empId,
          orgId,
          targetEmployee.version,
          accessToken,
          dates,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(updatedEmployee.suspendedAt ? "Suspended" : "Suspension scheduled");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        if (getStepUpMethod(err)) throw err;
        toast.error(formatClientErrorMessage(err, "We couldn't suspend them. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSetSuspendedUntil = useCallback(
    async (empId: string, until: string | null) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;
      try {
        const updatedEmployee = await setEmployeeSuspendedUntil(
          empId,
          orgId,
          targetEmployee.version,
          until,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(until ? "End date saved" : "End date cleared");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't save the end date. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleReinstateEmployee = useCallback(
    async (empId: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return;
      try {
        const updatedEmployee = await reinstateEmployee(empId, orgId, targetEmployee.version);
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Reinstated");
        invalidateEmployees();
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't reinstate them. Try again."));
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleActivateEmployee = useCallback(
    async (empId: string, startDate?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return;
      if (startDate) {
        try {
          const updatedEmployee = await activateEmployee(
            empId,
            orgId,
            targetEmployee.version,
            startDate,
          );
          setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
          toast.success("Restore scheduled");
          invalidateEmployees();
        } catch (err) {
          if (err instanceof EmployeeStatusConflictError) {
            setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
            toast.error(changedElsewhereMessage("their status"));
            return;
          }
          toast.error(
            formatClientErrorMessage(err, "We couldn't schedule the restore. Try again."),
          );
        }
        return;
      }

      const now = new Date().toISOString();
      const prevAll = allEmployeesRef.current;
      setAllLocal((prev) =>
        prev.map((e) =>
          e.id === empId
            ? {
                ...e,
                status: "active" as const,
                statusNote: "",
                awayUntil: null,
                statusChangedAt: now,
              }
            : e,
        ),
      );
      try {
        const updatedEmployee = await activateEmployee(empId, orgId, targetEmployee.version);
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(targetEmployee.status === "removed" ? "Restored" : "Marked active");
        invalidateEmployees();
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return;
        }
        setAllLocal(prevAll);
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return;
        }
        toast.error("We couldn't change their status. Try again.");
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleBulkStatusChange = useCallback(
    async (
      action: BulkStatusAction,
      empIds: readonly string[],
      options: { note?: string; returnDate?: string | null } = {},
      accessToken?: string,
    ) => {
      if (!orgId) return [];
      const people = empIds.flatMap((empId) => {
        const employee = allEmployeesRef.current.find((e) => e.id === empId);
        return employee ? [{ empId, expectedVersion: employee.version }] : [];
      });
      if (people.length === 0) return [];
      const outcomes = await changeEmployeeStatuses(
        { orgId, action, people, ...options },
        accessToken,
      );
      // A conflict carries the latest row, so the list shows what changed elsewhere.
      const rows = outcomes.flatMap((outcome) => (outcome.employee ? [outcome.employee] : []));
      if (rows.length > 0) {
        setAllLocal((prev) => rows.reduce((list, row) => replaceEmployeeRow(list, row), prev));
        invalidateEmployees();
      }
      return outcomes;
    },
    [orgId, invalidateEmployees],
  );

  const handleSetEmployeeReturnDate = useCallback(
    async (empId: string, returnDate: string | null, absenceTypeId?: number | null) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;
      try {
        const updatedEmployee = await setEmployeeReturnDate(
          empId,
          orgId,
          targetEmployee.version,
          returnDate,
          absenceTypeId ?? null,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success(returnDate ? "Return date saved" : "Return date cleared");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error(changedElsewhereMessage("their status"));
          return false;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't save the return date. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  return {
    employees,
    inactiveEmployees,
    removedEmployees,
    loading,
    handleAddEmployee,
    handleSaveEmployee,
    handleSaveSeniorityOrder,
    handleSaveEmployeeWithReinvite,
    handleRemoveEmployee,
    handleDeactivateEmployee,
    handleActivateEmployee,
    handleReinstateEmployee,
    handleSuspendEmployee,
    handleSetSuspendedUntil,
    handleSetEmployeeReturnDate,
    handleSetPlannedChange,
    handleBulkStatusChange,
  };
}

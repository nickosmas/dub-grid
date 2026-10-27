import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateEmployee,
  reinstateEmployee,
  suspendEmployee,
  deactivateEmployee,
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  fetchEmployees,
  insertEmployee,
  removeEmployee,
  setEmployeeReturnDate,
  updateEmployee,
} from "@/features/employees/client";
import { createOrganizationInvitation } from "@/features/organization/client";
import { getStepUpMethod } from "@/features/account/client/step-up";
import { toast } from "sonner";
import { SELF_ACTION_FORBIDDEN_MESSAGE, SelfActionForbiddenError } from "@dubgrid/domain";
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
  /** Saves an employee whose email just changed while a pending invitation
   *  exists, then creates and sends a replacement invitation at the new
   *  address (reusing the old invitation's role/departments). */
  handleSaveEmployeeWithReinvite: (
    emp: Employee,
    oldInvitation: Invitation,
    runStepUp: StepUpRun,
  ) => Promise<boolean>;
  /** A step-up refusal is rethrown (after the optimistic change is undone) for the caller to prompt. */
  handleRemoveEmployee: (empId: string, note?: string, accessToken?: string) => Promise<boolean>;
  handleDeactivateEmployee: (
    empId: string,
    note?: string,
    accessToken?: string,
    returnDate?: string | null,
    absenceTypeId?: number | null,
  ) => Promise<boolean>;
  handleActivateEmployee: (empId: string) => Promise<void>;
  /** Gives a suspended person their access back (51c). */
  handleReinstateEmployee: (empId: string) => Promise<void>;
  /** A step-up refusal is rethrown for the caller to prompt. */
  handleSuspendEmployee: (empId: string, accessToken?: string) => Promise<boolean>;
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

export function useEmployees(orgId: string | null): EmployeesData {
  const queryClient = useQueryClient();

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
          toast.error(formatClientErrorMessage(err, "We couldn't add employee. Try again."));
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
      setAllLocal((prev) => replaceEmployeeRow(prev, emp));
      try {
        const savedEmployee = await updateEmployee(emp, orgId, emp.version);
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
          toast.error("Employee changed elsewhere. Review the latest values and try again.");
          return false;
        }
        // Restore only this row: a reorder saves many rows at once, and the
        // others may have succeeded.
        const previous = prevAll.find((row) => row.id === emp.id);
        if (previous) {
          setAllLocal((prev) => prev.map((row) => (row.id === emp.id ? previous : row)));
        }
        toast.error(formatClientErrorMessage(err, "We couldn't save employee. Try again."));
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
      setAllLocal((prev) => replaceEmployeeRow(prev, emp));

      let savedEmployee: Employee;
      try {
        savedEmployee = await updateEmployee(emp, orgId, emp.version);
        setAllLocal((prev) => replaceEmployeeRow(prev, savedEmployee));
        invalidateEmployees();
      } catch (err) {
        if (err instanceof EmployeeProfileConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error("Employee changed elsewhere. Review the latest values and try again.");
          return false;
        }
        setAllLocal(prevAll);
        toast.error(formatClientErrorMessage(err, "We couldn't save employee. Try again."));
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
    async (empId: string, note?: string, accessToken?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;

      const now = new Date().toISOString();
      const prevAll = allEmployeesRef.current;
      setAllLocal((prev) =>
        prev.map((e) =>
          e.id === empId ? { ...e, status: "removed" as const, statusChangedAt: now } : e,
        ),
      );
      try {
        const updatedEmployee = await removeEmployee(
          empId,
          orgId,
          targetEmployee.version,
          note,
          accessToken,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Archived");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
          return false;
        }
        setAllLocal(prevAll);
        if (getStepUpMethod(err)) throw err;
        if (err instanceof SelfActionForbiddenError) {
          toast.error(formatClientErrorMessage(err, SELF_ACTION_FORBIDDEN_MESSAGE));
          return false;
        }
        toast.error("We couldn't archive them. Try again.");
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
    ) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;

      const prevAll = allEmployeesRef.current;
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
        const updatedEmployee = await (returnDate
          ? deactivateEmployee(
              empId,
              note,
              orgId,
              targetEmployee.version,
              accessToken,
              returnDate,
              absenceTypeId,
            )
          : deactivateEmployee(empId, note, orgId, targetEmployee.version, accessToken));
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Marked away");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
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

  const handleSuspendEmployee = useCallback(
    async (empId: string, accessToken?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return false;
      try {
        const updatedEmployee = await suspendEmployee(
          empId,
          orgId,
          targetEmployee.version,
          accessToken,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Suspended");
        invalidateEmployees();
        return true;
      } catch (err) {
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => replaceEmployeeRow(prev, err.latestEmployee));
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
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
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
          return;
        }
        toast.error(formatClientErrorMessage(err, "We couldn't reinstate them. Try again."));
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleActivateEmployee = useCallback(
    async (empId: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return;

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
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
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
          toast.error("Employee status changed elsewhere. Review the latest values and try again.");
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
    handleSaveEmployeeWithReinvite,
    handleRemoveEmployee,
    handleDeactivateEmployee,
    handleActivateEmployee,
    handleReinstateEmployee,
    handleSuspendEmployee,
    handleSetEmployeeReturnDate,
  };
}

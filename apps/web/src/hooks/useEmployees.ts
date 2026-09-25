import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateEmployee,
  deactivateEmployee,
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  fetchEmployees,
  insertEmployee,
  removeEmployee,
  updateEmployee,
} from "@/features/employees/client";
import { createOrganizationInvitation } from "@/features/organization/client";
import { toast } from "sonner";
import { SELF_ACTION_FORBIDDEN_MESSAGE, SelfActionForbiddenError } from "@dubgrid/domain";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { useOrgRealtimeInvalidation } from "@/hooks/useOrgRealtimeInvalidation";
import { useLatestRef } from "@/hooks/useLatestRef";
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
  handleSaveEmployeeWithReinvite: (emp: Employee, oldInvitation: Invitation) => Promise<boolean>;
  handleRemoveEmployee: (empId: string, note?: string) => Promise<void>;
  handleDeactivateEmployee: (empId: string, note?: string) => Promise<void>;
  handleActivateEmployee: (empId: string) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEmployees(orgId: string | null): EmployeesData {
  const queryClient = useQueryClient();

  // Subscribe to org-wide CDC so adds/edits made elsewhere (e.g. /people in
  // another tab, or another step in the onboarding wizard) invalidate this
  // hook's `employees.all` query and refetch automatically.
  useOrgRealtimeInvalidation({ orgId, queryClient });

  // Fetch all employees via React Query
  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.all(orgId!),
    queryFn: () => fetchEmployees(orgId!, ["active", "inactive", "removed"]),
    enabled: !!orgId,
    staleTime: 2 * 60_000, // 2 min — mutations invalidate immediately
  });

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
      try {
        const added: Employee[] = [];
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
        toast.error(formatClientErrorMessage(err, "We couldn't add employee. Try again."));
        Sentry.captureException(err);
        return undefined;
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
        toast.success("Employee saved");
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
        setAllLocal(prevAll);
        toast.error(formatClientErrorMessage(err, "We couldn't save employee. Try again."));
        Sentry.captureException(err);
        return false;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSaveEmployeeWithReinvite = useCallback(
    async (emp: Employee, oldInvitation: Invitation) => {
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
        await createOrganizationInvitation({
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
    async (empId: string, note?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return;

      const now = new Date().toISOString();
      const prevAll = allEmployeesRef.current;
      setAllLocal((prev) =>
        prev.map((e) =>
          e.id === empId ? { ...e, status: "removed" as const, statusChangedAt: now } : e,
        ),
      );
      try {
        const updatedEmployee = await removeEmployee(empId, orgId, targetEmployee.version, note);
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Employee removed");
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
        toast.error("We couldn't remove them. Try again.");
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleDeactivateEmployee = useCallback(
    async (empId: string, note?: string) => {
      const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
      if (!targetEmployee || !orgId) return;

      const prevAll = allEmployeesRef.current;
      setAllLocal((prev) =>
        prev.map((e) =>
          e.id === empId
            ? {
                ...e,
                status: "inactive" as const,
                statusNote: note ?? "",
                statusChangedAt: new Date().toISOString(),
              }
            : e,
        ),
      );
      try {
        const updatedEmployee = await deactivateEmployee(
          empId,
          note,
          orgId,
          targetEmployee.version,
        );
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Employee marked inactive");
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
        toast.error("We couldn't update their status. Try again.");
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
            ? { ...e, status: "active" as const, statusNote: "", statusChangedAt: now }
            : e,
        ),
      );
      try {
        const updatedEmployee = await activateEmployee(empId, orgId, targetEmployee.version);
        setAllLocal((prev) => replaceEmployeeRow(prev, updatedEmployee));
        toast.success("Employee activated");
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
        toast.error("We couldn't reactivate them. Try again.");
        Sentry.captureException(err);
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
  };
}

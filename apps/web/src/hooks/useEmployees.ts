import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateEmployee,
  deactivateEmployee,
  EmployeeStatusConflictError,
  fetchEmployees,
  insertEmployee,
  removeEmployee,
  updateEmployee,
} from "@/features/employees/client";
import { toast } from "sonner";
import { SelfActionForbiddenError } from "@dubgrid/domain";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { broadcastInvalidation } from "@/lib/cache-broadcast";
import { useOrgRealtimeInvalidation } from "@/hooks/useOrgRealtimeInvalidation";
import type { Employee } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmployeesData {
  employees: Employee[];
  inactiveEmployees: Employee[];
  removedEmployees: Employee[];
  loading: boolean;
  handleAddEmployee: (dataList: Omit<Employee, "id" | "seniority">[]) => Promise<Employee[] | undefined>;
  handleSaveEmployee: (emp: Employee) => Promise<void>;
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
  const inactiveEmployees = useMemo(() => allLocal.filter((e) => e.status === "inactive"), [allLocal]);
  const removedEmployees = useMemo(() => allLocal.filter((e) => e.status === "removed"), [allLocal]);

  const loading = employeesQuery.isLoading;

  // Ref for capturing the latest employee list inside optimistic callbacks.
  const allEmployeesRef = useRef<Employee[]>([]);
  useEffect(() => {
    allEmployeesRef.current = allLocal;
  }, [allLocal]);

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
          const newEmp = await insertEmployee(
            { ...data, seniority: maxSen + 1 },
            orgId,
          );
          added.push(newEmp);
        }
        setAllLocal((prev) => [...prev, ...added]);
        toast.success(added.length === 1 ? "Employee added" : `${added.length} employees added`);
        invalidateEmployees();
        return added;
      } catch (err) {
        toast.error(formatClientErrorMessage(err, "Failed to add employee"));
        Sentry.captureException(err);
        return undefined;
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleSaveEmployee = useCallback(
    async (emp: Employee) => {
      if (!orgId) return;
      let prevAll: Employee[] = [];
      setAllLocal((prev) => {
        prevAll = prev;
        return prev.map((e) => (e.id === emp.id ? emp : e));
      });
      try {
        await updateEmployee(emp, orgId, emp.version);
        toast.success("Employee saved");
        invalidateEmployees();
      } catch (err) {
        // On version conflict, swap in the server's latest copy instead of
        // rolling back to pre-edit state — that way the user sees what
        // actually exists and can re-edit from the real current row.
        if (err instanceof EmployeeStatusConflictError) {
          setAllLocal((prev) => prev.map((employee) => (
            employee.id === emp.id ? err.latestEmployee : employee
          )));
          toast.error("Employee changed elsewhere. Review the latest values and try again.");
          return;
        }
        setAllLocal(prevAll);
        toast.error(formatClientErrorMessage(err, "Failed to save employee"));
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleRemoveEmployee = useCallback(async (empId: string, note?: string) => {
    const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
    if (!targetEmployee || !orgId) return;

    const now = new Date().toISOString();
    let prevAll: Employee[] = [];
    setAllLocal((prev) => {
      prevAll = prev;
      return prev.map((e) =>
        e.id === empId ? { ...e, status: "removed" as const, statusChangedAt: now } : e,
      );
    });
    try {
      const updatedEmployee = await removeEmployee(empId, orgId, targetEmployee.version, note);
      setAllLocal((prev) => prev.map((employee) => (
        employee.id === empId ? updatedEmployee : employee
      )));
      toast.success("Employee removed");
      invalidateEmployees();
    } catch (err) {
      if (err instanceof EmployeeStatusConflictError) {
        setAllLocal((prev) => prev.map((employee) => (
          employee.id === empId ? err.latestEmployee : employee
        )));
        toast.error("Employee status changed elsewhere. Review the latest values and try again.");
        return;
      }
      setAllLocal(prevAll);
      if (err instanceof SelfActionForbiddenError) {
        toast.error(err.message);
        return;
      }
      toast.error("Failed to remove employee");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  const handleDeactivateEmployee = useCallback(async (empId: string, note?: string) => {
    const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
    if (!targetEmployee || !orgId) return;

    let prevAll: Employee[] = [];
    setAllLocal((prev) => {
      prevAll = prev;
      return prev.map((e) =>
        e.id === empId
          ? { ...e, status: "inactive" as const, statusNote: note ?? "", statusChangedAt: new Date().toISOString() }
          : e,
      );
    });
    try {
      const updatedEmployee = await deactivateEmployee(
        empId,
        note,
        orgId,
        targetEmployee.version,
      );
      setAllLocal((prev) => prev.map((employee) => (
        employee.id === empId ? updatedEmployee : employee
      )));
      toast.success("Employee marked inactive");
      invalidateEmployees();
    } catch (err) {
      if (err instanceof EmployeeStatusConflictError) {
        setAllLocal((prev) => prev.map((employee) => (
          employee.id === empId ? err.latestEmployee : employee
        )));
        toast.error("Employee status changed elsewhere. Review the latest values and try again.");
        return;
      }
      setAllLocal(prevAll);
      if (err instanceof SelfActionForbiddenError) {
        toast.error(err.message);
        return;
      }
      toast.error("Failed to update employee status");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  const handleActivateEmployee = useCallback(async (empId: string) => {
    const targetEmployee = allEmployeesRef.current.find((employee) => employee.id === empId);
    if (!targetEmployee || !orgId) return;

    const now = new Date().toISOString();
    let prevAll: Employee[] = [];
    setAllLocal((prev) => {
      prevAll = prev;
      return prev.map((e) =>
        e.id === empId
          ? { ...e, status: "active" as const, statusNote: "", statusChangedAt: now }
          : e,
      );
    });
    try {
      const updatedEmployee = await activateEmployee(empId, orgId, targetEmployee.version);
      setAllLocal((prev) => prev.map((employee) => (
        employee.id === empId ? updatedEmployee : employee
      )));
      toast.success("Employee activated");
      invalidateEmployees();
    } catch (err) {
      if (err instanceof EmployeeStatusConflictError) {
        setAllLocal((prev) => prev.map((employee) => (
          employee.id === empId ? err.latestEmployee : employee
        )));
        toast.error("Employee status changed elsewhere. Review the latest values and try again.");
        return;
      }
      setAllLocal(prevAll);
      if (err instanceof SelfActionForbiddenError) {
        toast.error(err.message);
        return;
      }
      toast.error("Failed to activate employee");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  return {
    employees,
    inactiveEmployees,
    removedEmployees,
    loading,
    handleAddEmployee,
    handleSaveEmployee,
    handleRemoveEmployee,
    handleDeactivateEmployee,
    handleActivateEmployee,
  };
}

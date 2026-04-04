import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEmployees, insertEmployee, updateEmployee, deleteEmployee, benchEmployee, activateEmployee } from "@/lib/db";
import { toast } from "sonner";
import * as Sentry from "@/lib/sentry";
import { queryKeys } from "@/lib/query-keys";
import type { Employee } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmployeesData {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  loading: boolean;
  handleAddEmployee: (dataList: Omit<Employee, "id" | "seniority">[]) => Promise<void>;
  handleSaveEmployee: (emp: Employee) => Promise<void>;
  handleDeleteEmployee: (empId: string) => Promise<void>;
  handleBenchEmployee: (empId: string, note?: string) => Promise<void>;
  handleActivateEmployee: (empId: string) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEmployees(orgId: string | null): EmployeesData {
  const queryClient = useQueryClient();

  // Fetch all employees via React Query
  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.all(orgId!),
    queryFn: () => fetchEmployees(orgId!, ["active", "benched", "terminated"]),
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
  const benchedEmployees = useMemo(() => allLocal.filter((e) => e.status === "benched"), [allLocal]);
  const terminatedEmployees = useMemo(() => allLocal.filter((e) => e.status === "terminated"), [allLocal]);

  const loading = employeesQuery.isLoading;

  // Ref for capturing current active employees in functional updaters
  const employeesRef = useRef<Employee[]>([]);
  useEffect(() => { employeesRef.current = employees; }, [employees]);

  // Helper: invalidate the all-employees query so the next focus/navigation
  // picks up any server-side changes.
  const invalidateEmployees = useCallback(() => {
    if (orgId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
    }
  }, [queryClient, orgId]);

  const handleAddEmployee = useCallback(
    async (dataList: Omit<Employee, "id" | "seniority">[]) => {
      if (!orgId) return;
      try {
        const added: Employee[] = [];
        for (const data of dataList) {
          const maxSen = Math.max(
            ...employeesRef.current.map((e) => e.seniority),
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
      } catch (err) {
        toast.error("Failed to add employee");
        Sentry.captureException(err);
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
        await updateEmployee(emp, orgId);
        toast.success("Employee saved");
        invalidateEmployees();
      } catch (err) {
        setAllLocal(prevAll);
        toast.error("Failed to save employee");
        Sentry.captureException(err);
      }
    },
    [orgId, invalidateEmployees],
  );

  const handleDeleteEmployee = useCallback(async (empId: string) => {
    const now = new Date().toISOString();
    let prevAll: Employee[] = [];
    setAllLocal((prev) => {
      prevAll = prev;
      return prev.map((e) =>
        e.id === empId ? { ...e, status: "terminated" as const, statusChangedAt: now } : e,
      );
    });
    try {
      await deleteEmployee(empId, orgId ?? undefined);
      toast.success("Employee terminated");
      invalidateEmployees();
    } catch (err) {
      setAllLocal(prevAll);
      toast.error("Failed to terminate employee");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  const handleBenchEmployee = useCallback(async (empId: string, note?: string) => {
    let prevAll: Employee[] = [];
    setAllLocal((prev) => {
      prevAll = prev;
      return prev.map((e) =>
        e.id === empId
          ? { ...e, status: "benched" as const, statusNote: note ?? "", statusChangedAt: new Date().toISOString() }
          : e,
      );
    });
    try {
      await benchEmployee(empId, note, orgId ?? undefined);
      toast.success("Employee benched");
      invalidateEmployees();
    } catch (err) {
      setAllLocal(prevAll);
      toast.error("Failed to bench employee");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  const handleActivateEmployee = useCallback(async (empId: string) => {
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
      await activateEmployee(empId, orgId ?? undefined);
      toast.success("Employee activated");
      invalidateEmployees();
    } catch (err) {
      setAllLocal(prevAll);
      toast.error("Failed to activate employee");
      Sentry.captureException(err);
    }
  }, [orgId, invalidateEmployees]);

  return {
    employees,
    benchedEmployees,
    terminatedEmployees,
    loading,
    handleAddEmployee,
    handleSaveEmployee,
    handleDeleteEmployee,
    handleBenchEmployee,
    handleActivateEmployee,
  };
}

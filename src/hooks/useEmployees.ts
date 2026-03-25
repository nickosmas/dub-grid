import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEmployees, insertEmployee, updateEmployee, deleteEmployee, benchEmployee, activateEmployee } from "@/lib/db";
import { toast } from "sonner";
import type { Employee } from "@/types";

// ── Module-level cache ──────────────────────────────────────────────────────
// Same pattern as org data cache — keyed by orgId to prevent cross-org leaks.

interface EmployeeCache {
  orgId: string;
  active: Employee[];
  benched: Employee[];
  terminated: Employee[];
  lastFetchedAt: number;
}

let employeeCache: EmployeeCache | null = null;

/** Clear the cache (call on logout to prevent cross-user data leaks). */
export function clearEmployeeCache(): void {
  employeeCache = null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

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
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setBenchedEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setTerminatedEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
}

export function useEmployees(orgId: string | null): EmployeesData {
  const cached = employeeCache?.orgId === orgId ? employeeCache : null;
  const [employees, setEmployees] = useState<Employee[]>(cached?.active ?? []);
  const [benchedEmployees, setBenchedEmployees] = useState<Employee[]>(cached?.benched ?? []);
  const [terminatedEmployees, setTerminatedEmployees] = useState<Employee[]>(cached?.terminated ?? []);
  const [loading, setLoading] = useState(!cached);

  const employeesRef = useRef<Employee[]>([]);
  employeesRef.current = employees;
  const benchedRef = useRef<Employee[]>([]);
  benchedRef.current = benchedEmployees;
  const terminatedRef = useRef<Employee[]>([]);
  terminatedRef.current = terminatedEmployees;

  // Sync state back to cache whenever it changes (covers mutations)
  useEffect(() => {
    if (orgId && !loading) {
      employeeCache = {
        orgId,
        active: employees,
        benched: benchedEmployees,
        terminated: terminatedEmployees,
        lastFetchedAt: employeeCache?.lastFetchedAt ?? Date.now(),
      };
    }
  }, [orgId, loading, employees, benchedEmployees, terminatedEmployees]);

  useEffect(() => {
    if (!orgId) return;

    // Skip re-fetch if cache is fresh (< 30s old) and matches this org
    if (employeeCache?.orgId === orgId && Date.now() - employeeCache.lastFetchedAt < 30_000) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        // Single query with all statuses, split by status in memory
        const all = await fetchEmployees(orgId!, ["active", "benched", "terminated"]);
        if (!cancelled) {
          const active = all.filter((e) => e.status === "active");
          const benched = all.filter((e) => e.status === "benched");
          const terminated = all.filter((e) => e.status === "terminated");
          setEmployees(active);
          setBenchedEmployees(benched);
          setTerminatedEmployees(terminated);
          employeeCache = { orgId: orgId!, active, benched, terminated, lastFetchedAt: Date.now() };
        }
      } catch (err) {
        console.error("Failed to load employees:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

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
        setEmployees((prev) => [...prev, ...added]);
        toast.success(added.length === 1 ? "Employee added" : `${added.length} employees added`);
      } catch (err) {
        toast.error("Failed to add employee");
        console.error(err);
      }
    },
    [orgId],
  );

  const handleSaveEmployee = useCallback(
    async (emp: Employee) => {
      if (!orgId) return;
      // Capture prev state via functional updater to avoid stale-ref race
      // when multiple saves fire in rapid succession.
      let prevEmployees: Employee[] = [];
      setEmployees((prev) => {
        prevEmployees = prev;
        return prev.map((e) => (e.id === emp.id ? emp : e));
      });
      try {
        await updateEmployee(emp, orgId);
        toast.success("Employee saved");
      } catch (err) {
        setEmployees(prevEmployees);
        toast.error("Failed to save employee");
        console.error(err);
      }
    },
    [orgId],
  );

  const handleDeleteEmployee = useCallback(async (empId: string) => {
    const now = new Date().toISOString();
    // Capture prev state via functional updaters to avoid stale-ref race
    let prevActive: Employee[] = [];
    let prevBenched: Employee[] = [];
    let prevTerminated: Employee[] = [];
    setEmployees((prev) => { prevActive = prev; return prev; });
    setBenchedEmployees((prev) => { prevBenched = prev; return prev; });
    setTerminatedEmployees((prev) => { prevTerminated = prev; return prev; });
    const activeEmp = prevActive.find((e) => e.id === empId);
    const benchedEmp = prevBenched.find((e) => e.id === empId);
    const emp = activeEmp ?? benchedEmp;
    if (emp) {
      setTerminatedEmployees((t) => [...t, { ...emp, status: "terminated", statusChangedAt: now }]);
    }
    if (activeEmp) setEmployees((prev) => prev.filter((e) => e.id !== empId));
    if (benchedEmp) setBenchedEmployees((prev) => prev.filter((e) => e.id !== empId));
    try {
      await deleteEmployee(empId);
      toast.success("Employee terminated");
    } catch (err) {
      setEmployees(prevActive);
      setBenchedEmployees(prevBenched);
      setTerminatedEmployees(prevTerminated);
      toast.error("Failed to terminate employee");
      console.error(err);
    }
  }, []);

  const handleBenchEmployee = useCallback(async (empId: string, note?: string) => {
    let prevActive: Employee[] = [];
    let prevBenched: Employee[] = [];
    setEmployees((prev) => { prevActive = prev; return prev; });
    setBenchedEmployees((prev) => { prevBenched = prev; return prev; });
    const emp = prevActive.find((e) => e.id === empId);
    if (emp) {
      const benched: Employee = { ...emp, status: "benched", statusNote: note ?? "", statusChangedAt: new Date().toISOString() };
      setBenchedEmployees((b) => [...b, benched]);
      setEmployees((prev) => prev.filter((e) => e.id !== empId));
    }
    try {
      await benchEmployee(empId, note);
      toast.success("Employee benched");
    } catch (err) {
      setEmployees(prevActive);
      setBenchedEmployees(prevBenched);
      toast.error("Failed to bench employee");
      console.error(err);
    }
  }, []);

  const handleActivateEmployee = useCallback(async (empId: string) => {
    const now = new Date().toISOString();
    let prevActive: Employee[] = [];
    let prevBenched: Employee[] = [];
    let prevTerminated: Employee[] = [];
    setEmployees((prev) => { prevActive = prev; return prev; });
    setBenchedEmployees((prev) => { prevBenched = prev; return prev; });
    setTerminatedEmployees((prev) => { prevTerminated = prev; return prev; });
    const benchedEmp = prevBenched.find((e) => e.id === empId);
    const terminatedEmp = prevTerminated.find((e) => e.id === empId);
    const emp = benchedEmp ?? terminatedEmp;
    if (emp) {
      setEmployees((a) => [...a, { ...emp, status: "active", statusNote: "", statusChangedAt: now }]);
    }
    if (benchedEmp) setBenchedEmployees((prev) => prev.filter((e) => e.id !== empId));
    if (terminatedEmp) setTerminatedEmployees((prev) => prev.filter((e) => e.id !== empId));
    try {
      await activateEmployee(empId);
      toast.success("Employee activated");
    } catch (err) {
      setEmployees(prevActive);
      setBenchedEmployees(prevBenched);
      setTerminatedEmployees(prevTerminated);
      toast.error("Failed to activate employee");
      console.error(err);
    }
  }, []);

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
    setEmployees,
    setBenchedEmployees,
    setTerminatedEmployees,
  };
}

import { useState, useMemo, useEffect, useCallback } from "react";
import { Employee } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";

export type EmployeeTab = "active" | "benched" | "terminated";
export type SortKey = "seniority" | "name";
export interface SortConfig { key: SortKey; dir: "asc" | "desc" }

const PAGE_SIZE = 15;

interface UseStaffFiltersOptions {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  showOnlyUnlinked?: boolean;
}

export function useStaffFilters({
  employees,
  benchedEmployees,
  terminatedEmployees,
  showOnlyUnlinked = false,
}: UseStaffFiltersOptions) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "seniority", dir: "asc" });
  const [filterFocusArea, setFilterFocusArea] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const hasActiveFilters = filterFocusArea !== null || filterRole !== null || showOnlyUnlinked;

  function clearFilters() {
    setFilterFocusArea(null);
    setFilterRole(null);
    setSearchQuery("");
  }

  const handleSort = useCallback((key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }, []);

  // Reset page when filters/sort/tab change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [activeTab, searchQuery, filterFocusArea, filterRole, sortConfig, showOnlyUnlinked]);

  const tabCounts = useMemo(
    () => ({
      active: employees.length,
      benched: benchedEmployees.length,
      terminated: terminatedEmployees.length,
    }),
    [employees.length, benchedEmployees.length, terminatedEmployees.length],
  );

  const rawList = useMemo(() => {
    const list =
      activeTab === "active"
        ? employees
        : activeTab === "benched"
          ? benchedEmployees
          : terminatedEmployees;

    return list.filter((emp) => {
      const matchesSearch =
        !searchQuery ||
        getEmployeeDisplayName(emp).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.phone && emp.phone.includes(searchQuery));

      const matchesFocusArea = !filterFocusArea || emp.focusAreaIds.includes(filterFocusArea);
      const matchesRole = !filterRole || emp.roleIds.includes(filterRole);
      const matchesUnlinked = !showOnlyUnlinked || !emp.userId;

      return matchesSearch && matchesFocusArea && matchesRole && matchesUnlinked;
    });
  }, [activeTab, employees, benchedEmployees, terminatedEmployees, searchQuery, filterFocusArea, filterRole, showOnlyUnlinked]);

  const sorted = useMemo(
    () => {
      const mul = sortConfig.dir === "asc" ? 1 : -1;
      return [...rawList].sort((a, b) => {
        if (sortConfig.key === "name") {
          return (a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)) * mul;
        }
        return (a.seniority - b.seniority) * mul;
      });
    },
    [rawList, sortConfig],
  );

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const paginatedList = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  const unlinkedCount = useMemo(() => employees.filter((e) => !e.userId).length, [employees]);
  const unlinkedNoEmail = useMemo(
    () => employees.filter((e) => !e.userId && !e.email).length,
    [employees],
  );

  return {
    // Tab
    activeTab,
    setActiveTab,
    tabCounts,
    // Search
    searchQuery,
    setSearchQuery,
    // Sort & filter
    sortConfig,
    handleSort,
    filterFocusArea,
    setFilterFocusArea,
    filterRole,
    setFilterRole,
    hasActiveFilters,
    clearFilters,
    // Lists
    rawList,
    sorted,
    paginatedList,
    // Pagination
    page,
    setPage,
    totalPages,
    totalCount: sorted.length,
    pageSize: PAGE_SIZE,
    // Unlinked
    unlinkedCount,
    unlinkedNoEmail,
  };
}

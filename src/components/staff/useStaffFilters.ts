import { useState, useMemo, useEffect } from "react";
import { Employee, FocusArea } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";

export type EmployeeTab = "active" | "benched" | "terminated";
export type SortBy = "seniority" | "name";

const PAGE_SIZE = 15;

interface UseStaffFiltersOptions {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  focusAreas: FocusArea[];
  showOnlyUnlinked?: boolean;
}

export function useStaffFilters({
  employees,
  benchedEmployees,
  terminatedEmployees,
  focusAreas,
  showOnlyUnlinked = false,
}: UseStaffFiltersOptions) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("seniority");
  const [filterFocusArea, setFilterFocusArea] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const hasActiveFilters = filterFocusArea !== null || filterRole !== null || showOnlyUnlinked;

  function clearFilters() {
    setFilterFocusArea(null);
    setFilterRole(null);
    setSearchQuery("");
  }

  // Reset page, close detail, clear selection when filters/sort/tab change
  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, filterFocusArea, filterRole, sortBy, showOnlyUnlinked]);

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
    () =>
      [...rawList].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);
          default:
            return a.seniority - b.seniority;
        }
      }),
    [rawList, sortBy],
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
    sortBy,
    setSortBy,
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

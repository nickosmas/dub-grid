import { useState, useMemo, useEffect, useCallback } from "react";
import { Employee } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";

export type EmployeeTab = "all" | "active" | "inactive" | "removed";
export type SortKey = "seniority" | "name";
export type EmploymentTypeFilter = "all" | Employee["employmentType"];
export type AccountLinkFilter = "all" | "linked" | "unlinked";
export type ContactPresenceFilter = "all" | "present" | "missing";
export interface SortConfig { key: SortKey; dir: "asc" | "desc" }

const PAGE_SIZE = 15;

interface UseStaffFiltersOptions {
  employees: Employee[];
  inactiveEmployees?: Employee[];
  removedEmployees?: Employee[];
}

export function useStaffFilters({
  employees,
  inactiveEmployees = [],
  removedEmployees = [],
}: UseStaffFiltersOptions) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "seniority", dir: "asc" });
  const [filterEmploymentType, setFilterEmploymentType] = useState<EmploymentTypeFilter>("all");
  const [filterDepartment, setFilterDepartment] = useState<number | null>(null);
  const [filterDepartmentAdminOnly, setFilterDepartmentAdminOnly] = useState(false);
  const [filterFocusArea, setFilterFocusArea] = useState<number | null>(null);
  const [filterCertification, setFilterCertification] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);
  const [filterAccountLink, setFilterAccountLink] = useState<AccountLinkFilter>("all");
  const [filterEmailPresence, setFilterEmailPresence] = useState<ContactPresenceFilter>("all");
  const [filterPhonePresence, setFilterPhonePresence] = useState<ContactPresenceFilter>("all");
  const [page, setPage] = useState(1);

  const hasActiveFilters =
    filterEmploymentType !== "all" ||
    filterDepartment !== null ||
    filterDepartmentAdminOnly ||
    filterFocusArea !== null ||
    filterCertification !== null ||
    filterRole !== null ||
    filterAccountLink !== "all" ||
    filterEmailPresence !== "all" ||
    filterPhonePresence !== "all";

  function clearFilters() {
    setFilterEmploymentType("all");
    setFilterDepartment(null);
    setFilterDepartmentAdminOnly(false);
    setFilterFocusArea(null);
    setFilterCertification(null);
    setFilterRole(null);
    setFilterAccountLink("all");
    setFilterEmailPresence("all");
    setFilterPhonePresence("all");
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
  }, [
    activeTab,
    searchQuery,
    filterEmploymentType,
    filterDepartment,
    filterDepartmentAdminOnly,
    filterFocusArea,
    filterCertification,
    filterRole,
    filterAccountLink,
    filterEmailPresence,
    filterPhonePresence,
    sortConfig,
  ]);

  const tabCounts = useMemo(
    () => ({
      all: employees.length + inactiveEmployees.length + removedEmployees.length,
      active: employees.length,
      inactive: inactiveEmployees.length,
      removed: removedEmployees.length,
    }),
    [employees.length, inactiveEmployees.length, removedEmployees.length],
  );

  const rawList = useMemo(() => {
    const list =
      activeTab === "all"
        ? [...employees, ...inactiveEmployees, ...removedEmployees]
        : activeTab === "active"
          ? employees
          : activeTab === "inactive"
            ? inactiveEmployees
            : removedEmployees;

    return list.filter((emp) => {
      const matchesSearch =
        !searchQuery ||
        getEmployeeDisplayName(emp).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.phone && emp.phone.includes(searchQuery));

      const matchesEmploymentType =
        filterEmploymentType === "all" || emp.employmentType === filterEmploymentType;
      const matchesDepartment =
        !filterDepartment || emp.departmentIds.includes(filterDepartment);
      const matchesDepartmentAdmin =
        !filterDepartmentAdminOnly ||
        (filterDepartment
          ? emp.deptAdminIds.includes(filterDepartment)
          : emp.deptAdminIds.length > 0);
      const matchesFocusArea = !filterFocusArea || emp.focusAreaIds.includes(filterFocusArea);
      const matchesCertification = !filterCertification || emp.certificationId === filterCertification;
      const matchesRole = !filterRole || emp.roleIds.includes(filterRole);
      const matchesAccountLink =
        filterAccountLink === "all" ||
        (filterAccountLink === "linked" ? Boolean(emp.userId) : !emp.userId);
      const matchesEmailPresence =
        filterEmailPresence === "all" ||
        (filterEmailPresence === "present" ? Boolean(emp.email) : !emp.email);
      const matchesPhonePresence =
        filterPhonePresence === "all" ||
        (filterPhonePresence === "present" ? Boolean(emp.phone) : !emp.phone);

      return (
        matchesSearch &&
        matchesEmploymentType &&
        matchesDepartment &&
        matchesDepartmentAdmin &&
        matchesFocusArea &&
        matchesCertification &&
        matchesRole &&
        matchesAccountLink &&
        matchesEmailPresence &&
        matchesPhonePresence
      );
    });
  }, [
    activeTab,
    employees,
    inactiveEmployees,
    removedEmployees,
    searchQuery,
    filterEmploymentType,
    filterDepartment,
    filterDepartmentAdminOnly,
    filterFocusArea,
    filterCertification,
    filterRole,
    filterAccountLink,
    filterEmailPresence,
    filterPhonePresence,
  ]);

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
    filterEmploymentType,
    setFilterEmploymentType,
    filterDepartment,
    setFilterDepartment,
    filterDepartmentAdminOnly,
    setFilterDepartmentAdminOnly,
    filterFocusArea,
    setFilterFocusArea,
    filterCertification,
    setFilterCertification,
    filterRole,
    setFilterRole,
    filterAccountLink,
    setFilterAccountLink,
    filterEmailPresence,
    setFilterEmailPresence,
    filterPhonePresence,
    setFilterPhonePresence,
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

import { useState, useMemo, useEffect, useCallback } from "react";
import type { Employee, FocusArea, NamedItem } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";

export type EmployeeTab = "all" | "active" | "inactive" | "removed";
export type SortKey = "seniority" | "name";
export type EmploymentTypeFilter = "all" | Employee["employmentType"];
export type AccountLinkFilter = "all" | "linked" | "unlinked";
export type ContactPresenceFilter = "all" | "present" | "missing";
/**
 * A specific certification id, or the two presence cases. "any" is the People
 * page's certified-staff count; "none" is its support-staff complement.
 */
export type CertificationFilter = number | "any" | "none" | null;
export interface SortConfig {
  key: SortKey;
  dir: "asc" | "desc";
}

const PAGE_SIZE = 15;

interface UseStaffFiltersOptions {
  employees: Employee[];
  inactiveEmployees?: Employee[];
  removedEmployees?: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  regularUserMode?: boolean;
}

export function useStaffFilters({
  employees,
  inactiveEmployees = [],
  removedEmployees = [],
  focusAreas,
  certifications,
  roles,
  regularUserMode = false,
}: UseStaffFiltersOptions) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "seniority", dir: "asc" });
  const [filterEmploymentType, setFilterEmploymentType] = useState<EmploymentTypeFilter>("all");
  const [filterDepartment, setFilterDepartment] = useState<number | null>(null);
  const [filterDepartmentAdminOnly, setFilterDepartmentAdminOnly] = useState(false);
  const [filterFocusArea, setFilterFocusArea] = useState<number | null>(null);
  const [filterCertification, setFilterCertification] = useState<CertificationFilter>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);
  const [filterAccountLink, setFilterAccountLink] = useState<AccountLinkFilter>("all");
  const [filterEmailPresence, setFilterEmailPresence] = useState<ContactPresenceFilter>("all");
  const [filterPhonePresence, setFilterPhonePresence] = useState<ContactPresenceFilter>("all");
  const [page, setPage] = useState(1);

  const activeFilterCount = [
    !regularUserMode && filterEmploymentType !== "all",
    !regularUserMode && filterDepartment !== null,
    !regularUserMode && filterDepartmentAdminOnly,
    filterFocusArea !== null,
    filterCertification !== null,
    filterRole !== null,
    !regularUserMode && filterAccountLink !== "all",
    !regularUserMode && filterEmailPresence !== "all",
    !regularUserMode && filterPhonePresence !== "all",
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

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
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
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

  // employees.departmentIds is rarely populated (no UI writes it) — derive an
  // employee's effective scheduled department(s) from their focus areas instead,
  // same as the read-only precedent in StaffReadOnlyDetailPanel.tsx.
  const focusAreaDepartmentById = useMemo(() => {
    const map = new Map<number, number>();
    for (const fa of focusAreas) {
      if (fa.departmentId != null) map.set(fa.id, fa.departmentId);
    }
    return map;
  }, [focusAreas]);

  const focusAreaNameById = useMemo(
    () => new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name.toLowerCase()])),
    [focusAreas],
  );
  const certificationSearchTextById = useMemo(
    () =>
      new Map(
        certifications.map((certification) => [
          certification.id,
          `${certification.name} ${certification.abbr}`.toLowerCase(),
        ]),
      ),
    [certifications],
  );
  const roleSearchTextById = useMemo(
    () => new Map(roles.map((role) => [role.id, `${role.name} ${role.abbr}`.toLowerCase()])),
    [roles],
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

    const normalizedSearch = searchQuery.trim().toLowerCase();

    return list.filter((emp) => {
      const visibleDirectoryText = [
        getEmployeeDisplayName(emp),
        ...emp.focusAreaIds.map((id) => focusAreaNameById.get(id) ?? ""),
        emp.certificationId == null
          ? ""
          : (certificationSearchTextById.get(emp.certificationId) ?? ""),
        ...emp.roleIds.map((id) => roleSearchTextById.get(id) ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = regularUserMode
        ? !normalizedSearch || visibleDirectoryText.includes(normalizedSearch)
        : !normalizedSearch ||
          getEmployeeDisplayName(emp).toLowerCase().includes(normalizedSearch) ||
          emp.email.toLowerCase().includes(normalizedSearch) ||
          emp.phone.toLowerCase().includes(normalizedSearch);

      const matchesEmploymentType =
        regularUserMode ||
        filterEmploymentType === "all" ||
        emp.employmentType === filterEmploymentType;
      const matchesDepartment =
        regularUserMode ||
        !filterDepartment ||
        emp.focusAreaIds.some((id) => focusAreaDepartmentById.get(id) === filterDepartment);
      const matchesDepartmentAdmin =
        regularUserMode ||
        !filterDepartmentAdminOnly ||
        (filterDepartment
          ? emp.deptAdminIds.includes(filterDepartment)
          : emp.deptAdminIds.length > 0);
      const matchesFocusArea = !filterFocusArea || emp.focusAreaIds.includes(filterFocusArea);
      const matchesCertification =
        filterCertification === null ||
        (filterCertification === "any"
          ? emp.certificationId != null
          : filterCertification === "none"
            ? emp.certificationId == null
            : emp.certificationId === filterCertification);
      const matchesRole = !filterRole || emp.roleIds.includes(filterRole);
      const matchesAccountLink =
        regularUserMode ||
        filterAccountLink === "all" ||
        (filterAccountLink === "linked" ? Boolean(emp.userId) : !emp.userId);
      const matchesEmailPresence =
        regularUserMode ||
        filterEmailPresence === "all" ||
        (filterEmailPresence === "present" ? Boolean(emp.email) : !emp.email);
      const matchesPhonePresence =
        regularUserMode ||
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
    focusAreaDepartmentById,
    filterFocusArea,
    filterCertification,
    filterRole,
    filterAccountLink,
    filterEmailPresence,
    filterPhonePresence,
    regularUserMode,
    focusAreaNameById,
    certificationSearchTextById,
    roleSearchTextById,
  ]);

  const sorted = useMemo(() => {
    const mul = sortConfig.dir === "asc" ? 1 : -1;
    return [...rawList].sort((a, b) => {
      if (sortConfig.key === "name") {
        return (
          (a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)) * mul
        );
      }
      return (a.seniority - b.seniority) * mul;
    });
  }, [rawList, sortConfig]);

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
    activeFilterCount,
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

import { useState, useMemo, useEffect, useCallback } from "react";
import { getEffectiveOrgRole, getOrgRolePrivilegeRank } from "@dubgrid/domain";
import type { Employee, FocusArea, NamedItem, OrganizationRole } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";

export type EmployeeTab = "all" | "active" | "inactive" | "removed";
export type SortKey = "seniority" | "name" | "access";

/** What the toolbar's sort dropdown offers, in the order it lists them. */
export const STAFF_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "seniority", label: "Sort: Seniority" },
  { value: "name", label: "Sort: Name" },
  { value: "access", label: "Sort: Access level" },
];
export type EmploymentTypeFilter = "all" | Employee["employmentType"];
export type AccountLinkFilter = "all" | "linked" | "unlinked";
export type ContactPresenceFilter = "all" | "present" | "missing";
/** Everyone, or one access tier, matching the roster half's own role filter. */
export type OrgRoleFilter = "all" | OrganizationRole;
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
  /**
   * Effective access tier per employee, the same value the Access column
   * prints. Absent while the viewer can't load directory data, which is also
   * when the Access column and its filter stay hidden.
   */
  orgRoleByEmployeeId?: ReadonlyMap<string, OrganizationRole>;
}

export function useStaffFilters({
  employees,
  inactiveEmployees = [],
  removedEmployees = [],
  focusAreas,
  certifications,
  roles,
  regularUserMode = false,
  orgRoleByEmployeeId,
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
  const [filterOrgRole, setFilterOrgRole] = useState<OrgRoleFilter>("all");
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
    !regularUserMode && filterOrgRole !== "all",
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
    setFilterOrgRole("all");
    setFilterEmailPresence("all");
    setFilterPhonePresence("all");
    setSearchQuery("");
  }

  const handleSort = useCallback((key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }, []);

  /**
   * Picking a key from the sort dropdown, as opposed to clicking a column
   * header. Re-picking the key you already have is not a request to reverse
   * the order, so this always lands ascending rather than toggling.
   */
  const setSortKey = useCallback((key: SortKey) => {
    setSortConfig({ key, dir: "asc" });
  }, []);

  // Reset page when filters/sort/tab change
  useEffect(() => {
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
    filterOrgRole,
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
      // Access is an admin-only column, and an admin-only filter with it:
      // nobody else is shown the tier it narrows on. Staff with no account
      // count as Users, so picking that tier returns everyone but the admins.
      const matchesOrgRole =
        regularUserMode ||
        filterOrgRole === "all" ||
        getEffectiveOrgRole(orgRoleByEmployeeId?.get(emp.id)) === filterOrgRole;
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
        matchesOrgRole &&
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
    filterOrgRole,
    orgRoleByEmployeeId,
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
      if (sortConfig.key === "access") {
        const rankComparison =
          getOrgRolePrivilegeRank(orgRoleByEmployeeId?.get(a.id) ?? null) -
          getOrgRolePrivilegeRank(orgRoleByEmployeeId?.get(b.id) ?? null);
        // A tier holds many people, so name breaks the tie rather than leaving
        // the order inside a tier down to whatever the list arrived in.
        return (
          (rankComparison ||
            a.firstName.localeCompare(b.firstName) ||
            a.lastName.localeCompare(b.lastName)) * mul
        );
      }
      return (a.seniority - b.seniority) * mul;
    });
  }, [rawList, sortConfig, orgRoleByEmployeeId]);

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
    setSortKey,
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
    filterOrgRole,
    setFilterOrgRole,
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

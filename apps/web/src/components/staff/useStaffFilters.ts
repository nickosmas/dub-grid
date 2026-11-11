import { useState, useMemo, useEffect, useCallback } from "react";
import { getEffectiveOrgRole, getOrgRolePrivilegeRank } from "@dubgrid/domain";
import type { Employee, FocusArea, NamedItem, OrganizationRole } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { getStaffAccountState, type StaffAccountState } from "./staff-account-state";

export type EmployeeTab = "all" | "active" | "inactive" | "suspended" | "removed";
export type SortKey = "seniority" | "name" | "access";

/** What the toolbar's sort dropdown offers, in the order it lists them. */
export const STAFF_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "seniority", label: "Sort: Seniority" },
  { value: "name", label: "Sort: Name" },
  { value: "access", label: "Sort: Access role" },
];
export type EmploymentType = Employee["employmentType"];
export type PhonePresence = "present" | "missing";
/**
 * A specific certification id, or the two presence cases. "any" is the People
 * page's certified-staff count; "none" is its support-staff complement.
 */
export type CertificationChoice = number | "any" | "none";
/*
 * Each filter holds the choices ticked in it. A person matches a filter when
 * they match any one of its choices, and must match every filter that has
 * one. Nothing ticked turns the filter off.
 */
export type EmploymentTypeFilter = readonly EmploymentType[];
export type AccountStateFilter = readonly StaffAccountState[];
export type PhonePresenceFilter = readonly PhonePresence[];
/** Access tiers, matching the roster half's own role filter. */
export type OrgRoleFilter = readonly OrganizationRole[];
export type CertificationFilter = readonly CertificationChoice[];
export type IdFilter = readonly number[];
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
  /** People with an open invitation, the same map the Account column reads. */
  pendingInviteEmployeeIds?: ReadonlyMap<string, unknown>;
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
  pendingInviteEmployeeIds,
}: UseStaffFiltersOptions) {
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: "seniority", dir: "asc" });
  const [filterEmploymentType, setFilterEmploymentType] = useState<EmploymentTypeFilter>([]);
  const [filterDepartment, setFilterDepartment] = useState<IdFilter>([]);
  const [filterFocusArea, setFilterFocusArea] = useState<IdFilter>([]);
  const [filterCertification, setFilterCertification] = useState<CertificationFilter>([]);
  const [filterRole, setFilterRole] = useState<IdFilter>([]);
  const [filterAccount, setFilterAccount] = useState<AccountStateFilter>([]);
  const [filterOrgRole, setFilterOrgRole] = useState<OrgRoleFilter>([]);
  const [filterPhonePresence, setFilterPhonePresence] = useState<PhonePresenceFilter>([]);
  const [page, setPage] = useState(1);

  const activeFilterCount = [
    !regularUserMode && filterEmploymentType.length > 0,
    !regularUserMode && filterDepartment.length > 0,
    filterFocusArea.length > 0,
    filterCertification.length > 0,
    filterRole.length > 0,
    !regularUserMode && filterAccount.length > 0,
    !regularUserMode && filterOrgRole.length > 0,
    !regularUserMode && filterPhonePresence.length > 0,
  ].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  // Search has its own clear button, so clearing filters leaves it alone.
  function clearFilters() {
    setFilterEmploymentType([]);
    setFilterDepartment([]);
    setFilterFocusArea([]);
    setFilterCertification([]);
    setFilterRole([]);
    setFilterAccount([]);
    setFilterOrgRole([]);
    setFilterPhonePresence([]);
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
    filterFocusArea,
    filterCertification,
    filterRole,
    filterAccount,
    filterOrgRole,
    filterPhonePresence,
    sortConfig,
  ]);

  const tabCounts = useMemo(
    () => ({
      all: employees.length + inactiveEmployees.length + removedEmployees.length,
      active: employees.length,
      inactive: inactiveEmployees.length,
      suspended: employees.filter((employee) => employee.suspendedAt).length,
      removed: removedEmployees.length,
    }),
    [employees, inactiveEmployees.length, removedEmployees.length],
  );

  // The Suspended tab disappears with its last person, so don't leave it selected.
  useEffect(() => {
    if (activeTab === "suspended" && tabCounts.suspended === 0) setActiveTab("active");
  }, [activeTab, tabCounts.suspended]);

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
            : activeTab === "suspended"
              ? employees.filter((employee) => employee.suspendedAt)
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
        filterEmploymentType.length === 0 ||
        filterEmploymentType.includes(emp.employmentType);
      const matchesDepartment =
        regularUserMode ||
        filterDepartment.length === 0 ||
        emp.focusAreaIds.some((id) => {
          const departmentId = focusAreaDepartmentById.get(id);
          return departmentId !== undefined && filterDepartment.includes(departmentId);
        });
      const matchesFocusArea =
        filterFocusArea.length === 0 || emp.focusAreaIds.some((id) => filterFocusArea.includes(id));
      const matchesCertification =
        filterCertification.length === 0 ||
        filterCertification.some((choice) =>
          choice === "any"
            ? emp.certificationId != null
            : choice === "none"
              ? emp.certificationId == null
              : emp.certificationId === choice,
        );
      const matchesRole =
        filterRole.length === 0 || emp.roleIds.some((id) => filterRole.includes(id));
      const matchesAccount =
        regularUserMode ||
        filterAccount.length === 0 ||
        filterAccount.includes(
          getStaffAccountState(emp, Boolean(pendingInviteEmployeeIds?.has(emp.id))),
        );
      // Access is an admin-only column, and an admin-only filter with it:
      // nobody else is shown the tier it narrows on. Staff with no account
      // count as Users, so picking that tier returns everyone but the admins.
      const matchesOrgRole =
        regularUserMode ||
        filterOrgRole.length === 0 ||
        filterOrgRole.includes(getEffectiveOrgRole(orgRoleByEmployeeId?.get(emp.id)));
      const matchesPhonePresence =
        regularUserMode ||
        filterPhonePresence.length === 0 ||
        filterPhonePresence.includes(emp.phone ? "present" : "missing");

      return (
        matchesSearch &&
        matchesEmploymentType &&
        matchesDepartment &&
        matchesFocusArea &&
        matchesCertification &&
        matchesRole &&
        matchesAccount &&
        matchesOrgRole &&
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
    focusAreaDepartmentById,
    filterFocusArea,
    filterCertification,
    filterRole,
    filterAccount,
    pendingInviteEmployeeIds,
    filterOrgRole,
    orgRoleByEmployeeId,
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
    filterFocusArea,
    setFilterFocusArea,
    filterCertification,
    setFilterCertification,
    filterRole,
    setFilterRole,
    filterAccount,
    setFilterAccount,
    filterOrgRole,
    setFilterOrgRole,
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
  };
}

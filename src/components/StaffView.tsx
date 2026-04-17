"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getCertAbbr, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor, DESIGNATION_COLORS, DEFAULT_DESIG_COLOR } from "@/lib/colors";
import { BOX_SHADOW_CARD, DAY_LABELS } from "@/lib/constants";
import { MaybeHint } from "@/components/ui/hint";
import { Employee, FocusArea, ShiftCode, NamedItem, Invitation, AbsenceType, ShiftDisplayMode, DirectoryPerson, Department } from "@/types";
import { useAuth } from "@/components/AuthProvider";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import { BulkImportModal } from "@/components/staff/BulkImportModal";
import { fetchInvitations, revokeInvitation, resendInvitation, fetchRecurringShifts, getRecurringDraft, upsertRecurringShift, deleteRecurringShift, saveRecurringDraft, deleteRecurringDraft, removeUserFromOrganization, updateAppOnlyUser, updatePendingInvitation, updateEmployeeIdentity } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import * as Sentry from "@/lib/sentry";
import { toast } from "sonner";
import CustomSelect, { SelectOption } from "./CustomSelect";
import ShiftPicker from "./ShiftPicker";
import { useMediaQuery, MOBILE, TABLET, useDirectory } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import { useStaffFilters, useStaffSelection, useStaffReorder, StaffTableRow, StaffEmptyState, StaffPagination, StaffDetailPanel, StaffFilterPopover, StaffContextBar } from "./staff";
import { SortIcon } from "./staff/SortIcon";
import { DirectorySummaryCards } from "./staff/DirectorySummaryCards";
import { ManagementStaffPanel } from "./staff/ManagementStaffPanel";
import { AddManagementUserToScheduleModal } from "./staff/AddManagementUserToScheduleModal";
import { EmployeeManagementAccessModal } from "./staff/EmployeeManagementAccessModal";
import { EmptyState } from "@/components/EmptyState";
import {
  applyManagementDirectoryUpdate,
  mergeEmployeeIntoDirectoryPerson,
  upsertEmployeeInList,
} from "@/lib/staff-directory";
import { Table, TableHeader, TableBody, TableRow as UITableRow, TableHead, TableCell } from "@/components/ui/table";
import UserManagementSettings from "@/components/settings/UserManagement";
import OrgActivityLog from "@/components/settings/ActivityLog";
import {
  SidebarProvider,
  SidebarInset,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";

const EMPTY_CODE_MAP = new Map<number, string>();

type StaffSection = "directory" | "access" | "activity" | "recurring-schedule";

interface StaffViewProps {
  employees: Employee[];
  benchedEmployees?: Employee[];
  terminatedEmployees?: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  orgId?: string;
  shiftCodes?: ShiftCode[];
  /** Full code map (including archived) for resolving historical labels. */
  shiftCodeMap?: Map<number, string>;
  absenceTypes?: AbsenceType[];
  departments?: Department[];
  departmentLabel?: string;
  canEditShifts?: boolean;
  canViewRecurringShifts?: boolean;
  canManageRecurringShifts?: boolean;
  canViewEmployeeDetails?: boolean;
  canManageEmployees?: boolean;
  isSuperAdmin?: boolean;
  isGridmaster?: boolean;
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  orgName?: string;
  shiftDisplayMode?: ShiftDisplayMode;
  /** True when org settings data (focus areas, shift codes, etc.) is not fully configured. */
  setupIncomplete?: boolean;
}

// ── Members section (the existing staff table) ────────────────────────────────

function MembersSection({
  employees,
  benchedEmployees,
  terminatedEmployees,
  focusAreas,
  certifications,
  roles,
  onSave,
  onDelete,
  onBench,
  onActivate,
  onAdd,
  canViewEmployeeDetails,
  canManageEmployees,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  orgId,
  orgName,
  isSuperAdmin,
  isGridmaster,
  departments: departmentItems = [],
  departmentLabel = "Department",
}: {
  employees: Employee[];
  benchedEmployees: Employee[];
  terminatedEmployees: Employee[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onSave: (emp: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
  onAdd: () => void;
  canViewEmployeeDetails: boolean;
  canManageEmployees: boolean;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  orgId?: string;
  orgName?: string;
  isSuperAdmin?: boolean;
  isGridmaster?: boolean;
  departments?: Department[];
  departmentLabel?: string;
  setupIncomplete?: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const queryClient = useQueryClient();
  const canManageManagementAccess = !!isSuperAdmin || !!isGridmaster;
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  // ── Extracted hooks ──
  const filters = useStaffFilters({ employees, benchedEmployees, terminatedEmployees, showOnlyUnlinked });
  const { activeTab, setActiveTab, searchQuery, setSearchQuery, sortConfig, handleSort, filterFocusArea, setFilterFocusArea, filterRole, setFilterRole, hasActiveFilters, clearFilters: clearFiltersBase, rawList, sorted, paginatedList: filterPaginatedList, page, setPage, totalPages, totalCount, pageSize: PAGE_SIZE, unlinkedCount } = filters;
  const clearFilters = useCallback(() => { clearFiltersBase(); setShowOnlyUnlinked(false); }, [clearFiltersBase]);
  const selection = useStaffSelection();
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = selection;
  const reorder = useStaffReorder({ sorted, onSave });
  const { isReordering, isDirty, enterReorder: handleEnterReorder, saveOrder: handleSaveOrder, cancelReorder: handleCancelReorder, draggedIdx, dragOverIdx, handleDragStart, handleDragOver, handleDrop, handleDragEnd, displayList, baseList } = reorder;

  // When reordering, paginate from displayList; otherwise use filter's paginated list
  const paginatedList = useMemo(
    () => isReordering ? displayList : filterPaginatedList,
    [isReordering, displayList, filterPaginatedList],
  );

  // Reset selection and close detail when filters/tab change
  useEffect(() => { clearSelection(); setExpandedEmpId(null); }, [activeTab, searchQuery, filterFocusArea, filterRole, sortConfig, showOnlyUnlinked, clearSelection]);

  // Invitation state
  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [inviteQueue, setInviteQueue] = useState<Employee[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [, setRevokingId] = useState<string | null>(null);

  // Fetch pending invitations for badge display
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetchInvitations(orgId).then((invites) => {
      if (cancelled) return;
      setPendingInvitations(
        invites.filter((inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date())
      );
    }).catch((err) => {
      Sentry.captureException(err);
    });
    return () => { cancelled = true; };
  }, [orgId]);

  const pendingInviteByEmployeeId = useMemo(() => {
    const map = new Map<string, Invitation>();
    for (const inv of pendingInvitations) {
      if (inv.employeeId) map.set(inv.employeeId, inv);
    }
    return map;
  }, [pendingInvitations]);

  // ── Management (directory) data ──
  const { directory } = useDirectory(orgId ?? null);
  const departmentUsers = useMemo(
    () => directory.filter((p) => p.managementDepartmentIds.length > 0),
    [directory],
  );
  const activeManagementUsers = useMemo(
    () => departmentUsers.filter((person) => person.isManagementUser),
    [departmentUsers],
  );

  // Management filter state
  const [showManagement, setShowManagement] = useState(false);
  const [deptFilterId, setDeptFilterId] = useState<number | null>(null);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [managementAccessEmployee, setManagementAccessEmployee] = useState<Employee | null>(null);
  const [managementSchedulePerson, setManagementSchedulePerson] = useState<DirectoryPerson | null>(null);

  const filteredDeptUsers = useMemo(() => {
    let list = departmentUsers;
    if (deptFilterId === -1) list = list.filter((u) => u.managementDepartmentIds.length === 0);
    else if (deptFilterId !== null) list = list.filter((u) => u.managementDepartmentIds.includes(deptFilterId));
    if (showManagement && searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q))
      );
    }
    return list;
  }, [departmentUsers, deptFilterId, showManagement, searchQuery]);

  const deptCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const u of departmentUsers) {
      for (const dId of u.managementDepartmentIds) {
        counts.set(dId, (counts.get(dId) ?? 0) + 1);
      }
    }
    return counts;
  }, [departmentUsers]);

  const managementDepts = useMemo(
    () => (departmentItems ?? []).filter(d => d.type === "management"),
    [departmentItems],
  );

  // Reset management filters when toggling off
  useEffect(() => { if (!showManagement) { setDeptFilterId(null); setExpandedPersonId(null); } }, [showManagement]);

  // App-only invite modal state
  const [showManagementInvite, setShowAppOnlyInvite] = useState(false);

  // Bulk import state
  const [showImport, setShowImport] = useState(false);

  function handleExport() {
    if (!orgId) return;
    window.open(`/api/export?type=staff&orgId=${orgId}`, "_blank");
  }

  function refreshInvitations() {
    if (!orgId) return;
    fetchInvitations(orgId).then((invites) => {
      setPendingInvitations(
        invites.filter((inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date())
      );
    }).catch(() => {});
  }

  async function handleRevokeInvitation(invitationId: string): Promise<boolean> {
    if (!orgId) return false;
    setRevokingId(invitationId);
    try {
      await revokeInvitation(invitationId, orgId);
      refreshInvitations();
      toast.success("Invitation revoked");
      return true;
    } catch {
      toast.error("Failed to revoke invitation");
      return false;
    } finally {
      setRevokingId(null);
    }
  }

  const handleSave = useCallback(
    (emp: Employee) => {
      onSave(emp);
    },
    [onSave],
  );

  const handleDelete = useCallback(
    (empId: string) => {
      onDelete(empId);
      setExpandedEmpId(null);
    },
    [onDelete],
  );

  // Can reorder only when: active tab, seniority sort asc, no filters/search, canManageEmployees
  const canReorder = activeTab === "active" && sortConfig.key === "seniority" && sortConfig.dir === "asc" && !searchQuery && !filterFocusArea && !filterRole && !showOnlyUnlinked && canManageEmployees && employees.length >= 2 && !showManagement;

  // Tab items for the dg-span-tabs
  const tabs: { key: "active" | "benched" | "terminated"; label: string; count: number }[] = [
    { key: "active", label: "All", count: employees.length },
    { key: "benched", label: "Benched", count: benchedEmployees.length },
    { key: "terminated", label: "Terminated", count: terminatedEmployees.length },
  ];

  // Find the currently selected employee for the detail panel
  const selectedEmployee = expandedEmpId
    ? [...employees, ...benchedEmployees, ...terminatedEmployees].find((e) => e.id === expandedEmpId)
    : null;
  const selectedEmployeeDirectoryPerson = selectedEmployee
    ? directory.find((person) => person.employeeId === selectedEmployee.id) ?? null
    : null;

  const selectedPerson = expandedPersonId ? departmentUsers.find((u) => u.personId === expandedPersonId) ?? null : null;

  const syncDirectoryPersonInCaches = useCallback((updatedPerson?: DirectoryPerson | null) => {
    if (!orgId || !updatedPerson) return;

    queryClient.setQueryData(
      queryKeys.org.directory(orgId),
      (current: DirectoryPerson[] | undefined) =>
        current?.map((person) => (
          person.personId === updatedPerson.personId ? updatedPerson : person
        )) ?? current,
    );
    setManagementSchedulePerson((current) =>
      current?.personId === updatedPerson.personId ? updatedPerson : current,
    );
  }, [orgId, queryClient]);

  const syncExistingEmployeeInCaches = useCallback((updatedEmployee?: Employee | null) => {
    if (!orgId || !updatedEmployee) return;

    queryClient.setQueryData(
      queryKeys.employees.all(orgId),
      (current: Employee[] | undefined) =>
        current ? upsertEmployeeInList(current, updatedEmployee) : current,
    );
    queryClient.setQueryData(
      queryKeys.org.directory(orgId),
      (current: DirectoryPerson[] | undefined) =>
        current?.map((person) => (
          person.employeeId === updatedEmployee.id
            ? mergeEmployeeIntoDirectoryPerson(person, updatedEmployee)
            : person
        )) ?? current,
    );
    setManagementAccessEmployee((current) =>
      current?.id === updatedEmployee.id ? updatedEmployee : current,
    );
  }, [orgId, queryClient]);

  const syncManagementScheduleEmployeeInCaches = useCallback((person: DirectoryPerson, employee: Employee) => {
    if (!orgId) return;

    syncExistingEmployeeInCaches(employee);
    syncDirectoryPersonInCaches(mergeEmployeeIntoDirectoryPerson(person, employee));
  }, [orgId, syncDirectoryPersonInCaches, syncExistingEmployeeInCaches]);

  return (
    <>
      <div className="p-4 md:p-6 lg:px-12 lg:py-10">
        <div className="space-y-8 mx-auto" style={{ maxWidth: 1100 }}>

          {/* Header */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">Directory</h2>
            <p className="text-[14px] text-[var(--color-text-muted)] mt-1">View and manage your organization&apos;s staff roster.</p>
          </div>

          {/* Summary Cards */}
          <DirectorySummaryCards
            activeCount={employees.length}
            benchedCount={benchedEmployees.length}
            terminatedCount={terminatedEmployees.length}
            managementCount={activeManagementUsers.length}
          />

          {/* Search Bar */}
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-faint)]" style={{ left: 12 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="dg-input w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or phone..."
              style={{ height: 40, paddingLeft: 36 }}
            />
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* View selector: On Schedule / Management */}
              {managementDepts.length > 0 && (
                <CustomSelect
                  value={showManagement ? "management" : "schedule"}
                  options={[
                    { value: "schedule", label: `On Schedule (${employees.length})` },
                    { value: "management", label: `Management (${activeManagementUsers.length})` },
                  ]}
                  onChange={(v) => { setShowManagement(v === "management"); if (v === "schedule") { setActiveTab("active"); } }}
                  style={{ minWidth: 180 }}
                  fontSize={13}
                />
              )}

              {/* Filter button */}
              {!showManagement && (
                <button
                  ref={filterBtnRef}
                  onClick={() => setFilterOpen((v) => !v)}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                  style={{ position: "relative" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  {isMobile ? "" : "Filter"}
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--color-brand)]" />
                  )}
                </button>
              )}

              {/* Reorder button */}
              {canReorder && !showManagement && (
                <button
                  onClick={() => { handleEnterReorder(); setExpandedEmpId(null); setPage(1); }}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="3" y="2" width="2" height="2" rx="1" />
                    <rect x="9" y="2" width="2" height="2" rx="1" />
                    <rect x="3" y="6" width="2" height="2" rx="1" />
                    <rect x="9" y="6" width="2" height="2" rx="1" />
                    <rect x="3" y="10" width="2" height="2" rx="1" />
                    <rect x="9" y="10" width="2" height="2" rx="1" />
                  </svg>
                  {isMobile ? "" : "Reorder"}
                </button>
              )}

              {/* Tabs — only when NOT in management mode */}
              {!showManagement && (
                <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
                  {tabs.map((tab, i) => {
                    const active = activeTab === tab.key;
                    const prevActive = i > 0 && activeTab === tabs[i - 1].key;
                    const showDivider = i > 0 && !active && !prevActive;
                    return (
                      <span key={tab.key} style={{ display: "contents" }}>
                        {i > 0 && (
                          <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
                        )}
                        <button
                          onClick={() => { setActiveTab(tab.key); setExpandedEmpId(null); if (isReordering) handleCancelReorder(); }}
                          className={`dg-span-tab${active ? " active" : ""}`}
                        >
                          {tab.label}
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: 18, height: 18, borderRadius: "50%", padding: "0 4px",
                            fontSize: "var(--dg-fs-micro)", fontWeight: 700, lineHeight: 1,
                            background: active ? "rgba(255,255,255,0.25)" : "var(--color-border-light)",
                            color: active ? "inherit" : "var(--color-text-muted)",
                            marginLeft: 3,
                          }}>{tab.count}</span>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Department sub-filter tabs — management mode */}
              {showManagement && departmentItems.length > 0 && (
                <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
                  <button
                    onClick={() => setDeptFilterId(null)}
                    className={`dg-span-tab${deptFilterId === null ? " active" : ""}`}
                  >
                    All
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 18, height: 18, borderRadius: "50%", padding: "0 4px",
                      fontSize: "var(--dg-fs-micro)", fontWeight: 700, lineHeight: 1,
                      background: deptFilterId === null ? "rgba(255,255,255,0.25)" : "var(--color-border-light)",
                      color: deptFilterId === null ? "inherit" : "var(--color-text-muted)",
                      marginLeft: 3,
                    }}>{departmentUsers.length}</span>
                  </button>
                  {managementDepts.filter((d) => deptCounts.has(d.id)).map((dept, i) => {
                    const active = deptFilterId === dept.id;
                    const prevActive = i === 0 ? deptFilterId === null : deptFilterId === managementDepts.filter((d2) => deptCounts.has(d2.id))[i - 1]?.id;
                    const showDivider = !active && !prevActive;
                    return (
                      <span key={dept.id} style={{ display: "contents" }}>
                        <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
                        <button
                          onClick={() => setDeptFilterId(active ? null : dept.id)}
                          className={`dg-span-tab${active ? " active" : ""}`}
                        >
                          {dept.name}
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: 18, height: 18, borderRadius: "50%", padding: "0 4px",
                            fontSize: "var(--dg-fs-micro)", fontWeight: 700, lineHeight: 1,
                            background: active ? "rgba(255,255,255,0.25)" : "var(--color-border-light)",
                            color: active ? "inherit" : "var(--color-text-muted)",
                            marginLeft: 3,
                          }}>{deptCounts.get(dept.id) ?? 0}</span>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Import */}
              {!showManagement && canManageEmployees && orgId && !isMobile && (
                <button onClick={() => setShowImport(true)} className="dg-btn dg-btn-secondary dg-btn-sm">Import</button>
              )}

              {/* Export */}
              {!showManagement && orgId && !isMobile && (
                <button onClick={handleExport} className="dg-btn dg-btn-secondary dg-btn-sm">Export</button>
              )}

              {/* Add */}
              {((showManagement && canManageManagementAccess) || (!showManagement && canManageEmployees)) && (
                <button
                  onClick={showManagement ? () => setShowAppOnlyInvite(true) : onAdd}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                >
                  + Add
                </button>
              )}
            </div>
          </div>

          {/* Context bar: filter pills, bulk actions, reorder bar (employee mode only) */}
          {!showManagement && (
            <StaffContextBar
              filterFocusArea={filterFocusArea}
              filterRole={filterRole}
              hasActiveFilters={hasActiveFilters}
              onClearFocusArea={() => setFilterFocusArea(null)}
              onClearRole={() => setFilterRole(null)}
              onClearAll={clearFilters}
              focusAreas={focusAreas}
              roles={roles}
              focusAreaLabel={focusAreaLabel}
              selectionCount={selectedIds.size}
              selectedIds={selectedIds}
              activeTab={activeTab}
              canManageEmployees={canManageEmployees}
              displayList={displayList}
              pendingInviteByEmployeeId={pendingInviteByEmployeeId}
              onBulkInvite={(emps) => { setInviteEmployee(emps[0]); setInviteQueue(emps.slice(1)); }}
              onBulkBench={(ids) => { for (const id of ids) onBench(id); clearSelection(); }}
              onBulkActivate={(ids) => { for (const id of ids) onActivate(id); clearSelection(); }}
              onBulkTerminate={(ids) => { for (const id of ids) onDelete(id); clearSelection(); }}
              onClearSelection={clearSelection}
              isReordering={isReordering}
              isDirty={isDirty}
              onSaveOrder={handleSaveOrder}
              onCancelReorder={handleCancelReorder}
            />
          )}

          {/* Filter popover */}
          {!showManagement && (
            <StaffFilterPopover
              open={filterOpen}
              onClose={() => setFilterOpen(false)}
              anchorRef={filterBtnRef.current}
              filterFocusArea={filterFocusArea}
              onFilterFocusAreaChange={setFilterFocusArea}
              filterRole={filterRole}
              onFilterRoleChange={setFilterRole}
              focusAreas={focusAreas}
              roles={roles}
              focusAreaLabel={focusAreaLabel}
              roleLabel={roleLabel}
              unlinkedCount={unlinkedCount}
              showOnlyUnlinked={showOnlyUnlinked}
              onShowOnlyUnlinkedChange={setShowOnlyUnlinked}
              onClearAll={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          )}

          {/* ── Employee Table ── */}
          {!showManagement && (
            rawList.length > 0 ? (
              <>
                <div data-tour="staff-table" data-testid="staff-table" className="rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-surface)]">
                  <Table>
                    <TableHeader>
                      <UITableRow className="hover:bg-transparent bg-[var(--color-bg)]">
                        <TableHead className="pl-6 w-[60px] text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          <div className="flex items-center gap-1.5">
                            {canManageEmployees && !isReordering && (
                              <input
                                type="checkbox"
                                checked={paginatedList.length > 0 && paginatedList.every((e) => selectedIds.has(e.id))}
                                onChange={() => toggleSelectAll(paginatedList)}
                                onClick={(e) => e.stopPropagation()}
                                className="accent-[var(--color-today-text)] cursor-pointer w-3.5 h-3.5"
                              />
                            )}
                            <span
                              className="inline-flex items-center gap-1 cursor-pointer select-none"
                              onClick={() => handleSort("seniority")}
                            >
                              # <SortIcon active={sortConfig.key === "seniority"} dir={sortConfig.dir} />
                            </span>
                          </div>
                        </TableHead>
                        <TableHead
                          className="text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold cursor-pointer select-none"
                          onClick={() => handleSort("name")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Name <SortIcon active={sortConfig.key === "name"} dir={sortConfig.dir} />
                          </span>
                        </TableHead>
                        <TableHead className="hidden md:table-cell text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          {focusAreaLabel}
                        </TableHead>
                        <TableHead className="hidden md:table-cell text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          {certificationLabel}
                        </TableHead>
                        <TableHead className="hidden lg:table-cell text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          Roles
                        </TableHead>
                        <TableHead className="hidden lg:table-cell text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          Account
                        </TableHead>
                        <TableHead className="pr-6 w-[40px]" />
                      </UITableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedList.map((emp, i) => {
                        const globalIdx = (page - 1) * PAGE_SIZE + i;
                        const isExpanded = !isReordering && emp.id === expandedEmpId;
                        const isDragging = isReordering && draggedIdx !== null && baseList[draggedIdx]?.id === emp.id;
                        const isDropTarget = isReordering && dragOverIdx === globalIdx && draggedIdx !== null && draggedIdx !== globalIdx;
                        return (
                          <StaffTableRow
                            key={emp.id}
                            emp={emp}
                            globalIndex={globalIdx}
                            isExpanded={isExpanded}
                            isReordering={isReordering}
                            isDragging={isDragging}
                            isDropTarget={isDropTarget}
                            canManageEmployees={canManageEmployees}
                            isSelected={selectedIds.has(emp.id)}
                            focusAreas={focusAreas}
                            certifications={certifications}
                            roles={roles}
                            pendingInviteByEmployeeId={pendingInviteByEmployeeId}
                            onToggleSelect={toggleSelect}
                            onRowClick={(empId) => setExpandedEmpId(isExpanded ? null : empId)}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                          />
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {!isReordering && (
                  <StaffPagination
                    page={page}
                    totalPages={totalPages}
                    totalCount={totalCount}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                  />
                )}
              </>
            ) : (
              <StaffEmptyState
                activeTab={activeTab}
                hasFilters={!!(searchQuery || filterFocusArea || filterRole || showOnlyUnlinked)}
                onClearFilters={clearFilters}
              />
            )
          )}

          {/* ── Management Table ── */}
          {showManagement && (
            filteredDeptUsers.length > 0 ? (
              <div className="rounded-[var(--dg-radius-md)] border border-[var(--color-border-light)] overflow-hidden bg-[var(--color-surface)]">
                <Table>
                  <TableHeader>
                    <UITableRow className="hover:bg-transparent bg-[var(--color-bg)]">
                      <TableHead className="pl-6 text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                        Name
                      </TableHead>
                      {!isMobile && !isTablet && (
                        <TableHead className="text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          {departmentLabel}
                        </TableHead>
                      )}
                      {!isMobile && !isTablet && (
                        <TableHead className="text-[11px] tracking-wider uppercase text-[var(--color-text-subtle)] font-semibold">
                          Status
                        </TableHead>
                      )}
                      <TableHead className="pr-6 w-[40px]" />
                    </UITableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeptUsers.map((person) => {
                      const personDepts = person.managementDepartmentIds
                        .map(id => managementDepts.find(d => d.id === id))
                        .filter((d): d is NonNullable<typeof d> => d != null);
                      const isPending = person.invitationStatus !== null && !person.hasAppAccess;
                      const isExpanded = person.personId === expandedPersonId;
                      const statusLabel = isPending
                        ? (person.invitationStatus === "expired" ? "Expired" : "Pending")
                        : person.employeeStatus === "terminated"
                          ? "Terminated"
                          : person.employeeStatus === "benched"
                            ? "Benched"
                            : "Active";
                      const statusColors = isPending
                        ? { background: "var(--color-warning-bg)", color: "var(--color-warning-text)" }
                        : person.employeeStatus === "terminated"
                          ? { background: "var(--color-danger-bg)", color: "var(--color-danger-text)" }
                          : person.employeeStatus === "benched"
                            ? { background: "var(--color-warning-bg)", color: "var(--color-warning-text)" }
                            : { background: "var(--color-success-bg)", color: "var(--color-success-text)" };
                      return (
                        <UITableRow
                          key={person.personId}
                          className={`transition-colors cursor-pointer ${isExpanded ? "bg-[var(--color-control-active-bg)]" : "hover:bg-[var(--color-bg)]"}`}
                          onClick={() => setExpandedPersonId(isExpanded ? null : person.personId)}
                          style={{ opacity: isPending ? 0.7 : 1 }}
                        >
                          {/* Name */}
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                                style={{
                                  background: isPending ? "var(--color-surface)" : "var(--color-control-active-bg)",
                                  color: isPending ? "var(--color-text-muted)" : "var(--color-control-active-text)",
                                }}
                              >
                                {(person.firstName?.[0] ?? "").toUpperCase()}{(person.lastName?.[0] ?? "").toUpperCase() || "?"}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                                    {person.firstName || person.lastName ? `${person.firstName} ${person.lastName}`.trim() : person.email}
                                  </span>
                                  {person.source === "employee" && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: "var(--color-today-bg)", color: "var(--color-today-text)" }}>
                                      On Schedule
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] text-[var(--color-text-muted)] truncate mt-0.5">
                                  {person.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Department */}
                          {!isMobile && !isTablet && (
                            <TableCell className="py-4">
                              <span className="text-[13px] text-[var(--color-text-muted)]">
                                {personDepts.length > 0 ? personDepts.map(d => d.name).join(", ") : "\u2014"}
                              </span>
                            </TableCell>
                          )}

                          {/* Status */}
                          {!isMobile && !isTablet && (
                            <TableCell className="py-4">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={statusColors}
                              >
                                {statusLabel}
                              </span>
                            </TableCell>
                          )}

                          {/* Chevron */}
                          <TableCell className="pr-6 py-4 w-[40px] text-right">
                            <div className="flex items-center justify-center" style={{ color: isExpanded ? "var(--color-control-active-text)" : "var(--color-text-faint)" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 6 15 12 9 18" />
                              </svg>
                            </div>
                          </TableCell>
                        </UITableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                }
                title={searchQuery ? "No results found" : "No management members yet"}
                description={searchQuery ? "Try adjusting your search." : "People assigned to management will show here."}
              />
            )
          )}
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showImport && orgId && (
        <BulkImportModal
          orgId={orgId}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); window.location.reload(); }}
        />
      )}

      {/* Invite Employee Modal */}
      {inviteEmployee && orgId && (
        <InviteEmployeeModal
          employee={inviteEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
          onClose={() => { setInviteEmployee(null); setInviteQueue([]); }}
          onInvited={(updatedEmployee) => {
            syncExistingEmployeeInCaches(updatedEmployee);
            refreshInvitations();
            if (orgId) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
            }
            if (inviteQueue.length > 0) {
              setInviteEmployee(inviteQueue[0]);
              setInviteQueue((q) => q.slice(1));
            } else {
              setInviteEmployee(null);
            }
          }}
        />
      )}

      {/* Invite Management User Modal */}
      {showManagementInvite && orgId && (
        <InviteEmployeeModal
          employee={null}
          orgId={orgId}
          orgName={orgName || "your organization"}
          departments={departmentItems}
          onClose={() => setShowAppOnlyInvite(false)}
          onInvited={() => {
            setShowAppOnlyInvite(false);
            if (orgId) {
              void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            }
          }}
        />
      )}

      {/* Detail panel — employee */}
      {selectedEmployee && canViewEmployeeDetails && (
        <StaffDetailPanel
          employee={selectedEmployee}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          roleLabel={roleLabel}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          departments={departmentItems}
          departmentLabel={departmentLabel}
          canManageEmployees={canManageEmployees}
          orgId={orgId}
          pendingInviteByEmployeeId={pendingInviteByEmployeeId}
          onSave={handleSave}
          onDelete={handleDelete}
          onBench={(empId, note) => onBench(empId, note)}
          onActivate={(empId) => onActivate(empId)}
          onClose={() => setExpandedEmpId(null)}
          onInvite={(e) => setInviteEmployee(e)}
          canManageManagementAccess={canManageManagementAccess}
          hasManagementAccess={selectedEmployeeDirectoryPerson?.isManagementUser ?? false}
          hasPendingManagementInvite={
            !!selectedEmployeeDirectoryPerson
            && selectedEmployeeDirectoryPerson.managementDepartmentIds.length > 0
            && selectedEmployeeDirectoryPerson.invitationStatus !== null
            && !selectedEmployeeDirectoryPerson.hasAppAccess
          }
          onManageManagementAccess={canManageManagementAccess ? (employee) => setManagementAccessEmployee(employee) : undefined}
          onRevoke={handleRevokeInvitation}
          onRevokeAccess={isSuperAdmin && orgId ? async (userId: string) => {
            try {
              await removeUserFromOrganization(userId, orgId);
              toast.success("App access revoked");
              void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            } catch {
              toast.error("Failed to revoke app access");
            }
          } : undefined}
        />
      )}

      {/* Detail panel — management */}
      {selectedPerson && (
        <ManagementStaffPanel
          person={selectedPerson}
          departments={managementDepts}
          departmentLabel={departmentLabel}
          canManageScheduleEmployees={canManageEmployees}
          canManageManagementAccess={canManageManagementAccess}
          onClose={() => setExpandedPersonId(null)}
          onSave={async (data) => {
            if (orgId) {
              let updatedEmployee: Employee | null = null;

              if (selectedPerson.source === "employee" && selectedPerson.employeeId) {
                await updateEmployeeIdentity({
                  employeeId: selectedPerson.employeeId,
                  orgId,
                  userId: selectedPerson.userId,
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                });
                const pendingInvitation = pendingInviteByEmployeeId.get(selectedPerson.employeeId);
                if (selectedPerson.userId) {
                  await updateAppOnlyUser(selectedPerson.userId, orgId, {
                    departmentIds: data.managementDepartmentIds,
                  });
                } else if (pendingInvitation) {
                  await updatePendingInvitation(pendingInvitation.id, orgId, {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    phone: data.phone,
                    departmentIds: data.managementDepartmentIds,
                  });
                }
                const currentEmployee = [...employees, ...benchedEmployees, ...terminatedEmployees]
                  .find((employee) => employee.id === selectedPerson.employeeId);
                if (currentEmployee) {
                  updatedEmployee = {
                    ...currentEmployee,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    phone: data.phone,
                  };
                }
              } else if (selectedPerson.source === "pending_invite") {
                await updatePendingInvitation(selectedPerson.personId.replace("inv:", ""), orgId, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                });
              } else if (selectedPerson.userId) {
                await updateAppOnlyUser(selectedPerson.userId, orgId, {
                  firstName: data.firstName,
                  lastName: data.lastName,
                  phone: data.phone,
                  departmentIds: data.managementDepartmentIds,
                  });
              }
              if (updatedEmployee) {
                syncExistingEmployeeInCaches(updatedEmployee);
              }
              syncDirectoryPersonInCaches(applyManagementDirectoryUpdate(selectedPerson, data));
              refreshInvitations();
              void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
              void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
              toast.success("Changes saved");
            }
          }}
          onRevokeInvitation={canManageManagementAccess && orgId ? async (invitationId) => {
            await revokeInvitation(invitationId, orgId);
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            toast.success("Invitation revoked");
          } : undefined}
          onResendInvitation={canManageManagementAccess && orgId ? async (invitationId) => {
            await resendInvitation(invitationId, orgId);
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            toast.success("Invitation resent");
          } : undefined}
          onAddToSchedule={canManageEmployees ? (person) => {
            setManagementSchedulePerson(person);
          } : undefined}
          onBench={canManageEmployees ? onBench : undefined}
          onActivate={canManageEmployees ? onActivate : undefined}
          onTerminate={canManageEmployees ? onDelete : undefined}
        />
      )}

      {managementSchedulePerson && orgId && (
        <AddManagementUserToScheduleModal
          orgId={orgId}
          person={managementSchedulePerson}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          roleLabel={roleLabel}
          onClose={() => setManagementSchedulePerson(null)}
          onAdded={(employee) => {
            syncManagementScheduleEmployeeInCaches(managementSchedulePerson, employee);
            setManagementSchedulePerson(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
          }}
        />
      )}

      {managementAccessEmployee && orgId && canManageManagementAccess && (
        <EmployeeManagementAccessModal
          employee={managementAccessEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
          managementDepartments={managementDepts}
          directoryPerson={selectedEmployeeDirectoryPerson}
          pendingInvitation={pendingInviteByEmployeeId.get(managementAccessEmployee.id)}
          onClose={() => setManagementAccessEmployee(null)}
          onCompleted={(updatedEmployee) => {
            syncExistingEmployeeInCaches(updatedEmployee);
            refreshInvitations();
            void queryClient.invalidateQueries({ queryKey: queryKeys.org.directory(orgId) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all(orgId) });
          }}
        />
      )}
    </>
  );
}

// ── Shift cell popover (portal-based dropdown) ───────────────────────────────
function ShiftCellPopover({
  anchorRef,
  shiftCodes,
  focusAreas,
  currentLabel,
  onSelect,
  onClose,
  empFocusAreaIds,
  empCertificationId,
  absenceTypes,
  onAbsenceSelect,
  currentAbsenceTypeId,
  shiftDisplayMode,
}: {
  anchorRef: HTMLElement | null;
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  currentLabel: string;
  onSelect: (label: string, shiftCodeIds: number[]) => void;
  onClose: () => void;
  empFocusAreaIds: number[];
  empCertificationId?: number | null;
  absenceTypes?: AbsenceType[];
  onAbsenceSelect?: (absenceType: AbsenceType) => void;
  currentAbsenceTypeId?: number | null;
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [flippedUp, setFlippedUp] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    if (!anchorRef) return;
    const rect = anchorRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const flipUp = spaceBelow < 260;
    setFlippedUp(flipUp);
    const isMobileView = window.innerWidth < 768;
    const GAP = 8; // space between cell and popover (room for arrow)
    const maxW = window.innerWidth - 16;
    // Measure the popover's natural width so positioning is accurate
    const naturalWidth = menuRef.current ? Math.min(menuRef.current.scrollWidth, maxW) : Math.min(440, maxW);
    const popoverLeft = isMobileView ? 8 : Math.max(8, Math.min(rect.left + window.scrollX - 40, window.innerWidth - naturalWidth - 8));
    setMenuStyle({
      position: "absolute",
      top: flipUp ? undefined : rect.bottom + window.scrollY + GAP,
      bottom: flipUp ? window.innerHeight - rect.top - window.scrollY + GAP : undefined,
      left: isMobileView ? 8 : popoverLeft,
      width: isMobileView ? undefined : "auto",
      minWidth: isMobileView ? undefined : 320,
      maxWidth: maxW,
      right: isMobileView ? 8 : undefined,
      maxHeight: flipUp ? rect.top - 12 : spaceBelow,
      zIndex: 9999,
    });
    // Arrow: center on the anchor cell, relative to popover left
    const anchorCenterX = rect.left + window.scrollX + rect.width / 2;
    setArrowLeft(isMobileView
      ? anchorCenterX - 8
      : Math.max(16, Math.min(anchorCenterX - popoverLeft, naturalWidth - 16)));
  }, [anchorRef]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { updatePosition(); }, [updatePosition]);

  useEffect(() => {
    if (!anchorRef) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, updatePosition]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && anchorRef && !anchorRef.contains(target)) {
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [anchorRef]);

  const currentShiftCodeIds = useMemo(() => {
    if (!currentLabel || currentLabel === "OFF") return [];
    return currentLabel.split("/").map(l => shiftCodes.find(sc => sc.label === l || sc.name === l)?.id).filter((id): id is number => id != null);
  }, [currentLabel, shiftCodes]);

  if (!mounted || !anchorRef) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        boxShadow: "var(--shadow-menu)",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Arrow — two CSS triangles layered for seamless border-to-fill connection */}
      {/* Outer (border-colored) triangle */}
      <div style={{
        position: "absolute", left: arrowLeft - 1, width: 0, height: 0,
        borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
        ...(flippedUp
          ? { bottom: -8, borderTop: "8px solid var(--color-border)" }
          : { top: -8, borderBottom: "8px solid var(--color-border)" }),
      }} />
      {/* Inner (fill-colored) triangle — overlaps box edge by 1px to erase the border seam */}
      <div style={{
        position: "absolute", left: arrowLeft, width: 0, height: 0,
        borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
        ...(flippedUp
          ? { bottom: -7, borderTop: "7px solid var(--color-surface)" }
          : { top: -7, borderBottom: "7px solid var(--color-surface)" }),
      }} />
      {/* Inner container clips content while arrow stays visible outside */}
      <div style={{ overflow: "hidden", borderRadius: "var(--dg-radius-lg)", display: "flex", flexDirection: "column", maxHeight: "inherit" }}>
        <div style={{
          padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: "1px solid var(--color-border-light)",
        }}>
          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Select Shift
          </span>
          <button
            onClick={onClose}
            className="dg-btn dg-btn-ghost"
            style={{ padding: 4, lineHeight: 0 }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <ShiftPicker
            shiftCodes={shiftCodes}
            focusAreas={focusAreas}
            absenceTypes={absenceTypes}
            currentShiftCodeIds={currentShiftCodeIds}
            currentAbsenceTypeId={currentAbsenceTypeId}
            onSelect={(label, shiftCodeIds) => {
              onSelect(label, shiftCodeIds);
              onClose();
            }}
            onAbsenceSelect={onAbsenceSelect ? (at) => { onAbsenceSelect(at); onClose(); } : undefined}
            empFocusAreaIds={empFocusAreaIds}
            empCertificationId={empCertificationId}
            multiSelect={false}
            closeOnSelect={true}
            shiftDisplayMode={shiftDisplayMode}
          />
          {(currentLabel || currentAbsenceTypeId) && (
            <button
              onClick={() => { onSelect("", []); onClose(); }}
              className="dg-btn dg-btn-ghost"
              style={{ marginTop: 12, width: "100%", color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", fontWeight: 600 }}
            >
              Clear Shift
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Recurring Schedule section ────────────────────────────────────────────────

/** Encode a shift code ID as a recurring cell value. */
function encodeShift(id: number): string { return `s:${id}`; }
/** Encode an absence type ID as a recurring cell value. */
function encodeAbsence(id: number): string { return `a:${id}`; }
/** Parse an encoded recurring cell value back to its type + ID. */
function parseRecurringValue(v: string): { type: 'shift'; id: number } | { type: 'absence'; id: number } | null {
  if (v.startsWith('s:')) { const id = Number(v.slice(2)); return Number.isFinite(id) ? { type: 'shift', id } : null; }
  if (v.startsWith('a:')) { const id = Number(v.slice(2)); return Number.isFinite(id) ? { type: 'absence', id } : null; }
  return null;
}
/** Migrate a legacy draft value (plain label or abs: prefix) to ID-based encoding. */
function migrateLegacyDraftValue(v: string, shiftCodes: ShiftCode[], absenceTypes: AbsenceType[]): string {
  if (!v) return v;
  if (v.startsWith('s:') || v.startsWith('a:')) return v; // already new format
  // Legacy abs: prefix (brief interim format)
  if (v.startsWith('abs:')) {
    const atLabel = v.slice(4);
    const at = absenceTypes.find(a => a.label === atLabel);
    return at ? encodeAbsence(at.id) : '';
  }
  // Legacy plain label (shift code)
  const sc = shiftCodes.find(s => s.label === v);
  return sc ? encodeShift(sc.id) : '';
}

function RecurringScheduleSection({
  employees,
  orgId,
  currentUserId,
  shiftCodes,
  shiftCodeMap,
  canManage,
  focusAreas,
  certifications,
  absenceTypes = [],
  shiftDisplayMode = "code",
}: {
  employees: Employee[];
  orgId: string;
  currentUserId: string | null;
  shiftCodes: ShiftCode[];
  shiftCodeMap: Map<number, string>;
  canManage: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  absenceTypes?: AbsenceType[];
  shiftDisplayMode?: ShiftDisplayMode;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isNameMode = shiftDisplayMode === "name";
  // ── Lookup maps (by ID) for rendering ──
  const absenceTypeMap = useMemo(() => new Map(absenceTypes.map(at => [at.id, isNameMode ? (at.name || at.label) : at.label])), [absenceTypes, isNameMode]);
  const absenceTypeIdMap = useMemo(() => new Map(absenceTypes.map(at => [at.id, at])), [absenceTypes]);
  const shiftCodeIdMap = useMemo(() => new Map(shiftCodes.map(sc => [sc.id, sc])), [shiftCodes]);
  // ── Data state ──
  const [allSchedules, setAllSchedules] = useState<Record<string, Record<number, string>>>({});
  const [loading, setLoading] = useState(true);

  // ── Edit state ──
  const [dirtySchedules, setDirtySchedules] = useState<Record<string, Record<number, string>>>({});
  const [activeCell, setActiveCell] = useState<{ empId: string; dayIndex: number } | null>(null);
  const [activeCellEl, setActiveCellEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Draft state ──
  const [savedDraftTimestamp, setSavedDraftTimestamp] = useState<string | null>(null);

  // ── Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFocusArea, setFilterFocusArea] = useState<number | "">("");

  // ── Single batch fetch + draft recovery from DB ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const rows = await fetchRecurringShifts(orgId, undefined, shiftCodeMap, false, absenceTypeMap);
        if (cancelled) return;

        const schedules: Record<string, Record<number, string>> = {};
        for (const rs of rows) {
          if (!schedules[rs.empId]) schedules[rs.empId] = {};
          if (!(rs.dayOfWeek in schedules[rs.empId])) {
            // Encode as "s:<id>" or "a:<id>" — collision-proof and ID-stable
            let encoded = '';
            if (rs.shiftCodeId != null) encoded = encodeShift(rs.shiftCodeId);
            else if (rs.absenceTypeId != null) encoded = encodeAbsence(rs.absenceTypeId);
            schedules[rs.empId][rs.dayOfWeek] = encoded;
          }
        }
        setAllSchedules(schedules);

        // Load saved draft separately so a draft error doesn't block the main data
        try {
          if (!canManage || !currentUserId) return;
          const draft = await getRecurringDraft(orgId, currentUserId);
          if (!cancelled && draft?.draftData && Object.keys(draft.draftData).length > 0) {
            // Migrate legacy draft values (plain labels / abs: prefix) to ID-based format
            const migrated: Record<string, Record<number, string>> = {};
            for (const [eId, empDirty] of Object.entries(draft.draftData)) {
              for (const [dayStr, val] of Object.entries(empDirty)) {
                const mv = migrateLegacyDraftValue(val as string, shiftCodes, absenceTypes);
                if (mv !== undefined) {
                  if (!migrated[eId]) migrated[eId] = {};
                  migrated[eId][Number(dayStr)] = mv;
                }
              }
            }
            if (Object.keys(migrated).length > 0) {
              setDirtySchedules(migrated);
              setSavedDraftTimestamp(draft.savedAt);
            }
          }
        } catch {
          // Draft recovery is non-critical — ignore errors
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId, canManage, currentUserId, shiftCodeMap, absenceTypeMap, shiftCodes, absenceTypes]);

  // ── Derived state ──
  const hasDirtyChanges = Object.keys(dirtySchedules).length > 0;
  const dirtyCount = Object.values(dirtySchedules).reduce(
    (sum, empDirty) => sum + Object.keys(empDirty).length, 0
  );

  function getEffectiveLabel(empId: string, dayIndex: number): string {
    if (dirtySchedules[empId] && dayIndex in dirtySchedules[empId]) {
      return dirtySchedules[empId][dayIndex];
    }
    return allSchedules[empId]?.[dayIndex] ?? "";
  }

  function handleCellChange(empId: string, dayIndex: number, newLabel: string) {
    const original = allSchedules[empId]?.[dayIndex] ?? "";
    setDirtySchedules((prev) => {
      const empDirty = { ...(prev[empId] ?? {}) };
      if (newLabel === original) {
        delete empDirty[dayIndex];
      } else {
        empDirty[dayIndex] = newLabel;
      }
      const next = { ...prev };
      if (Object.keys(empDirty).length === 0) {
        delete next[empId];
      } else {
        next[empId] = empDirty;
      }
      return next;
    });
    setActiveCell(null);
    setActiveCellEl(null);
  }

  function handleCellClick(empId: string, dayIndex: number, el: HTMLElement) {
    if (!canManage) return;
    if (activeCell?.empId === empId && activeCell?.dayIndex === dayIndex) {
      setActiveCell(null);
      setActiveCellEl(null);
    } else {
      setActiveCell({ empId, dayIndex });
      setActiveCellEl(el);
    }
  }

  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  async function handleSaveAll() {
    setSaving(true);
    setError(null);
    const todayKey = getTodayKey();
    // Snapshot dirty entries so changes made during save aren't lost
    const snapshot = dirtySchedules;
    const savedKeys = new Set<string>();
    const skippedLabels: string[] = [];
    try {
      for (const [empId, empDirty] of Object.entries(snapshot)) {
        for (const [dayStr, newValue] of Object.entries(empDirty)) {
          const day = Number(dayStr);
          if (newValue) {
            const parsed = parseRecurringValue(newValue);
            if (!parsed) {
              skippedLabels.push(newValue);
              continue;
            }
            if (parsed.type === 'absence') {
              await upsertRecurringShift(empId, orgId, day, null, todayKey, parsed.id);
            } else {
              await upsertRecurringShift(empId, orgId, day, parsed.id, todayKey);
            }
          } else {
            await deleteRecurringShift(empId, day, orgId);
          }
          savedKeys.add(`${empId}:${dayStr}`);
        }
      }
      if (skippedLabels.length > 0) {
        const unique = [...new Set(skippedLabels)];
        toast.error(`Could not resolve ${unique.length} change${unique.length > 1 ? "s" : ""}`);
      }
      // Re-fetch from DB so allSchedules reflects what was actually persisted
      const freshRows = await fetchRecurringShifts(orgId, undefined, shiftCodeMap, false, absenceTypeMap);
      const freshSchedules: Record<string, Record<number, string>> = {};
      for (const rs of freshRows) {
        if (!freshSchedules[rs.empId]) freshSchedules[rs.empId] = {};
        if (!(rs.dayOfWeek in freshSchedules[rs.empId])) {
          let encoded = '';
          if (rs.shiftCodeId != null) encoded = encodeShift(rs.shiftCodeId);
          else if (rs.absenceTypeId != null) encoded = encodeAbsence(rs.absenceTypeId);
          freshSchedules[rs.empId][rs.dayOfWeek] = encoded;
        }
      }
      setAllSchedules(freshSchedules);
      // Only clear the entries we actually saved — preserve any new changes made during save
      setDirtySchedules((prev) => {
        const next: Record<string, Record<number, string>> = {};
        for (const [empId, empDirty] of Object.entries(prev)) {
          for (const [dayStr, label] of Object.entries(empDirty)) {
            if (!savedKeys.has(`${empId}:${dayStr}`)) {
              if (!next[empId]) next[empId] = {};
              next[empId][Number(dayStr)] = label;
            }
          }
        }
        return next;
      });
      setSavedDraftTimestamp(null);
      if (currentUserId) {
        await deleteRecurringDraft(orgId, currentUserId).catch(() => {});
      }
      toast.success("Recurring schedules saved");
    } catch (err: unknown) {
      toast.error("Failed to save recurring schedules");
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    try {
      if (!currentUserId) { toast.error("Not authenticated"); return; }
      await saveRecurringDraft(orgId, currentUserId, dirtySchedules);
      setSavedDraftTimestamp(new Date().toISOString());
      toast.success("Draft saved");
    } catch (err: unknown) {
      Sentry.captureException(err);
      toast.error(`Failed to save draft: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleDiscardDraft() {
    setDirtySchedules({});
    setSavedDraftTimestamp(null);
    if (currentUserId) {
      await deleteRecurringDraft(orgId, currentUserId).catch(() => {});
    }
  }

  // ── Filtering ──
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch = !searchQuery || getEmployeeDisplayName(emp).toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFocusArea = !filterFocusArea || emp.focusAreaIds.includes(filterFocusArea);
      return matchesSearch && matchesFocusArea;
    });
  }, [employees, searchQuery, filterFocusArea]);

  // Close popover if the active cell's employee is no longer visible after filtering
  useEffect(() => {
    if (activeCell && !filteredEmployees.some((e) => e.id === activeCell.empId)) {
      setActiveCell(null);
      setActiveCellEl(null);
    }
  }, [filteredEmployees, activeCell]);

  const sortedEmployees = useMemo(() => {
    return [...filteredEmployees].sort((a, b) => a.seniority - b.seniority);
  }, [filteredEmployees]);

  const focusAreaOptions: SelectOption<number | "">[] = useMemo(() => [
    { value: "" as const, label: "All Focus Areas" },
    ...focusAreas.map((fa) => ({ value: fa.id, label: fa.name })),
  ], [focusAreas]);

  // ── Find the employee for the active cell popover ──
  const activeCellEmp = activeCell ? employees.find((e) => e.id === activeCell.empId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Sticky save bar at top — shows when there are dirty changes (including restored drafts) */}
      {hasDirtyChanges && canManage && (
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "var(--color-info-bg)", border: "1px solid var(--color-info-border)", borderRadius: "var(--dg-radius-lg)",
          padding: isMobile ? "10px 12px" : "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="dg-draft-banner-dot" />
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-info-text)" }}>
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {savedDraftTimestamp && (
                <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-info)", opacity: 0.75 }}>
                  Draft saved {new Date(savedDraftTimestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveDraft}
              className="dg-btn dg-btn-secondary"
              style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)" }}
            >
              Save Draft
            </button>
            <button
              onClick={handleDiscardDraft}
              className="dg-btn dg-btn-ghost"
              style={{ padding: "6px 14px", fontSize: "var(--dg-fs-caption)", color: "var(--color-danger)" }}
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ padding: "6px 18px", fontSize: "var(--dg-fs-caption)" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          Recurring Shifts
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
          Set recurring shift patterns for each staff member. Click any cell to assign a shift.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: isMobile ? 8 : 12 }}>
        {focusAreas.length > 0 && (
          <CustomSelect
            value={filterFocusArea}
            options={focusAreaOptions}
            onChange={setFilterFocusArea}
            fontSize={12}
            style={{ minWidth: isMobile ? 120 : 160 }}
          />
        )}
        <div style={{ flex: 1, minWidth: isMobile ? "100%" : 0 }} />
        <div style={{ position: "relative", width: isMobile ? "100%" : undefined }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "7px 10px 7px 32px",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--dg-btn-radius)",
              fontSize: "var(--dg-fs-caption)",
              outline: "none",
              width: isMobile ? "100%" : 180,
              background: "var(--color-surface)",
              fontFamily: "inherit",
              transition: "border-color 150ms ease",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-border-focus)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
          />
        </div>
      </div>

      {/* Grid table */}
      {loading ? (
        <div style={{
          background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)",
          padding: "48px 20px", textAlign: "center", color: "var(--color-text-subtle)", fontSize: "var(--dg-fs-label)",
        }}>
          Loading recurring schedules...
        </div>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="No staff members"
          description="Add employees in the Members section to set up recurring shifts."
        />
      ) : sortedEmployees.length === 0 ? (
        <EmptyState
          title="No results found"
          description="Try adjusting your search or filter."
          action={
            <button
              onClick={() => { setSearchQuery(""); setFilterFocusArea(""); }}
              className="dg-btn dg-btn-secondary"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div style={{
          background: "var(--color-surface)", borderRadius: "var(--dg-radius-md)", border: "1px solid var(--color-border)",
          overflowX: "auto",
          boxShadow: BOX_SHADOW_CARD, position: "relative",
          WebkitOverflowScrolling: "touch",
        }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            minWidth: isMobile ? 448 : undefined,
            gridTemplateColumns: `${isMobile ? 140 : 220}px repeat(7, minmax(${isMobile ? 44 : 72}px, 1fr))`,
            background: "var(--color-bg)",
            borderBottom: "2px solid var(--color-dark)",
          }}>
            <div style={{
              padding: "10px 12px", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-subtle)",
              textTransform: "uppercase", letterSpacing: "0.04em",
              position: isMobile ? undefined : "sticky", left: isMobile ? undefined : 0, zIndex: isMobile ? undefined : 4,
              background: "var(--color-bg)",
              borderRight: "1px solid var(--color-border-light)",
              boxShadow: isMobile ? undefined : "2px 0 4px rgba(0,0,0,0.02)",
            }}>
              Staff
            </div>
            {DAY_LABELS.map((day) => (
              <div
                key={day}
                style={{
                  padding: "10px 4px", fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-subtle)",
                  textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Employee rows */}
          {sortedEmployees.map((emp, i) => {
            const isCurrentUser = !!(emp.userId && currentUserId && emp.userId === currentUserId);
            const rowBg = isCurrentUser ? "var(--color-today-bg)" : "var(--color-surface)";
            const certAbbr = emp.certificationId != null ? getCertAbbr(emp.certificationId, certifications) : null;
            const dc = certAbbr ? (DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR) : null;
            return (
              <div
                key={emp.id}
                className="dg-table-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${isMobile ? 140 : 220}px repeat(7, minmax(${isMobile ? 44 : 72}px, 1fr))`,
                  minWidth: isMobile ? 448 : undefined,
                  borderTop: i === 0 ? "none" : "1px solid var(--color-border-light)",
                  background: rowBg,
                  transition: "background 150ms ease",
                }}
              >
                {/* Name cell */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 12px",
                  borderRight: "1px solid var(--color-border-light)",
                  position: isMobile ? undefined : "sticky", left: isMobile ? undefined : 0, zIndex: isMobile ? undefined : 3,
                  background: rowBg,
                  boxShadow: isMobile ? undefined : "2px 0 4px rgba(0,0,0,0.02)",
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontWeight: 600, fontSize: "var(--dg-fs-label)", color: "var(--color-text-secondary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      {getEmployeeDisplayName(emp)}
                      {isCurrentUser && (
                        <span style={{
                          fontSize: "var(--dg-fs-micro)", fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                          background: "var(--color-brand-bg)", color: "var(--color-brand)", whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  {certAbbr && dc && (
                    <span style={{
                      fontSize: "var(--dg-fs-caption)", fontWeight: 700,
                      background: dc.bg, color: dc.text,
                      padding: "2px 7px", borderRadius: 20,
                      whiteSpace: "nowrap", flexShrink: 0, letterSpacing: "0.01em",
                      marginLeft: 6,
                    }}>
                      {certAbbr}
                    </span>
                  )}
                </div>

                {/* Day cells */}
                {DAY_LABELS.map((_, dayIdx) => {
                  const rawValue = getEffectiveLabel(emp.id, dayIdx);
                  const parsed = rawValue ? parseRecurringValue(rawValue) : null;
                  const st = parsed?.type === 'shift' ? shiftCodeIdMap.get(parsed.id) ?? null : null;
                  const at = parsed?.type === 'absence' ? absenceTypeIdMap.get(parsed.id) ?? null : null;
                  const isDirty = !!(dirtySchedules[emp.id] && dayIdx in dirtySchedules[emp.id]);
                  const isActive = activeCell?.empId === emp.id && activeCell?.dayIndex === dayIdx;
                  const stDisplay = st ? (isNameMode ? (st.name || st.label) : st.label) : null;
                  const atDisplay = at ? (isNameMode ? (at.name || at.label) : at.label) : null;
                  const cellLabel = stDisplay ?? atDisplay ?? null;
                  const nameModeFs = isMobile ? "var(--dg-fs-micro)" : "var(--dg-fs-caption)";
                  const codeModeFs = isMobile ? "var(--dg-fs-label)" : "var(--dg-fs-title)";

                  return (
                    <div
                      key={dayIdx}
                      className="dg-grid-cell"
                      data-interactive={canManage ? "true" : "false"}
                      tabIndex={canManage ? 0 : -1}
                      role="gridcell"
                      aria-label={cellLabel ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[dayIdx]}: ${cellLabel}` : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[dayIdx]}: empty`}
                      onClick={(e) => handleCellClick(emp.id, dayIdx, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (canManage && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          handleCellClick(emp.id, dayIdx, e.currentTarget as HTMLElement);
                        }
                      }}
                      style={{
                        height: "var(--dg-grid-cell-height)",
                        borderLeft: "1px solid var(--color-border-light)",
                        background: isActive ? "rgba(100,116,139,0.08)" : undefined,
                      }}
                    >
                      {st ? (
                        <MaybeHint
                          content={isNameMode ? stDisplay! : undefined}
                          side="top"
                        >
                          <div style={{
                            position: "absolute", top: 4, right: 4, bottom: 4, left: 4,
                            background: st.color,
                            border: isDirty ? `2px dashed ${st.text}` : `1px solid ${borderColor(st.text)}`,
                            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            color: st.text,
                            fontSize: isNameMode ? nameModeFs : codeModeFs,
                            fontWeight: 800,
                            padding: "2px 4px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            transition: "box-shadow 150ms ease",
                            boxShadow: isActive ? "0 0 0 2px rgba(100,116,139,0.3)" : "none",
                          }}>
                            {stDisplay}
                          </div>
                        </MaybeHint>
                      ) : at ? (
                        <MaybeHint
                          content={isNameMode ? atDisplay! : undefined}
                          side="top"
                        >
                          <div style={{
                            position: "absolute", top: 4, right: 4, bottom: 4, left: 4,
                            background: at.color,
                            border: isDirty ? `2px dashed ${at.text}` : `1px solid ${borderColor(at.text)}`,
                            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                            color: at.text,
                            fontSize: isNameMode ? nameModeFs : codeModeFs,
                            fontWeight: 800,
                            padding: "2px 4px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            transition: "box-shadow 150ms ease",
                            boxShadow: isActive ? "0 0 0 2px rgba(100,116,139,0.3)" : "none",
                          }}>
                            {atDisplay}
                          </div>
                        </MaybeHint>
                      ) : (
                        <div style={{
                          position: "absolute", top: 4, right: 4, bottom: 4, left: 4,
                          background: "transparent",
                          border: isDirty ? "2px dashed var(--color-text-subtle)" : "1px dashed var(--color-border-light)",
                          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)", fontWeight: 500,
                          transition: "box-shadow 150ms ease, background 80ms ease",
                          boxShadow: isActive ? "0 0 0 2px rgba(100,116,139,0.3)" : "none",
                        }}>
                          --
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Error banner */}
          {error && (
            <div style={{
              padding: "10px 20px", background: "var(--color-danger-bg)", borderTop: "1px solid var(--color-danger-border)",
              fontSize: "var(--dg-fs-caption)", color: "var(--color-danger)",
            }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Popover */}
      {activeCell && activeCellEmp && (() => {
        const rawValue = getEffectiveLabel(activeCell.empId, activeCell.dayIndex);
        const parsed = rawValue ? parseRecurringValue(rawValue) : null;
        const stObj = parsed?.type === 'shift' ? shiftCodeIdMap.get(parsed.id) : undefined;
        const currentShiftLabel = stObj ? (isNameMode ? (stObj.name || stObj.label) : stObj.label) : "";
        const currentAtId = parsed?.type === 'absence' ? parsed.id : null;
        return (
          <ShiftCellPopover
            anchorRef={activeCellEl}
            shiftCodes={shiftCodes}
            focusAreas={focusAreas}
            absenceTypes={absenceTypes}
            currentLabel={currentShiftLabel}
            currentAbsenceTypeId={currentAtId}
            onSelect={(_label, shiftCodeIds) => {
              const encoded = shiftCodeIds.length > 0 ? encodeShift(shiftCodeIds[0]) : "";
              handleCellChange(activeCell.empId, activeCell.dayIndex, encoded);
            }}
            onAbsenceSelect={(at) => handleCellChange(activeCell.empId, activeCell.dayIndex, encodeAbsence(at.id))}
            onClose={() => { setActiveCell(null); setActiveCellEl(null); }}
            empFocusAreaIds={activeCellEmp.focusAreaIds}
            empCertificationId={activeCellEmp.certificationId}
            shiftDisplayMode={shiftDisplayMode}
          />
        );
      })()}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function StaffView({
  employees,
  benchedEmployees = [],
  terminatedEmployees = [],
  focusAreas,
  certifications,
  roles,
  onSave,
  onDelete,
  onBench,
  onActivate,
  onAdd,
  orgId,
  shiftCodes,
  shiftCodeMap,
  absenceTypes,
  departments: departmentsProp = [],
  departmentLabel: departmentLabelProp = "Department",
  canViewRecurringShifts,
  canManageRecurringShifts,
  canViewEmployeeDetails,
  canManageEmployees,
  isSuperAdmin = false,
  isGridmaster = false,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certifications",
  roleLabel = "Roles",
  orgName,
  shiftDisplayMode = "code",
  setupIncomplete = false,
}: StaffViewProps) {
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery(MOBILE);
  const { user } = useAuth();
  const allowedSections: StaffSection[] = [
    "directory",
    ...((isSuperAdmin || isGridmaster) ? ["access" as const] : []),
    ...(orgId && canViewRecurringShifts ? ["recurring-schedule" as const] : []),
    ...(isSuperAdmin ? ["activity" as const] : []),
  ];
  const sectionParam = searchParams.get("section") as StaffSection | null;
  // Support legacy "members" and "users" section params for backwards compat
  const resolvedSection = sectionParam === ("members" as string) ? "directory" as StaffSection
    : sectionParam === ("users" as string) ? "access" as StaffSection
    : sectionParam;
  const activeSection: StaffSection = resolvedSection && allowedSections.includes(resolvedSection) ? resolvedSection : "directory";

  const iconMembers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  const iconUserMgmt = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  const iconActivity = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;

  const links: { id: StaffSection; label: string; icon: React.ReactNode }[] = [
    { id: "directory", label: "Directory", icon: iconMembers },
    ...((isSuperAdmin || isGridmaster) ? [{ id: "access" as StaffSection, label: "User Access", icon: iconUserMgmt }] : []),
    ...(orgId && canViewRecurringShifts ? [{ id: "recurring-schedule" as StaffSection, label: "Recurring Shifts", icon: iconCalendar }] : []),
    ...(isSuperAdmin ? [{ id: "activity" as StaffSection, label: "Activity Log", icon: iconActivity }] : []),
  ];

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dg-sidebar-manual-collapse") !== "true";
  });

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    localStorage.setItem("dg-sidebar-manual-collapse", String(!open));
  }, []);


  // Register sub-nav items for the mobile bottom sheet
  const subNavItems: SubNavItem[] = useMemo(
    () =>
      links.map((link) => ({
        id: link.id,
        label: link.label,
        icon: link.icon,
        href: link.id === "directory" ? "/people" : `/people?section=${link.id}`,
        active: activeSection === link.id,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSection, orgId, isSuperAdmin, isGridmaster],
  );
  useSetMobileSubNav(subNavItems);

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={{ minHeight: "unset" }}
    >
      {/* Sidebar — hidden on mobile (shown in bottom sheet), visible on desktop/tablet */}
      {!isMobile && (
        <Sidebar collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: "var(--app-shell-header-h, 56px)", height: "calc(100dvh - var(--app-shell-header-h, 56px))" }} onWheel={(e: React.WheelEvent) => e.preventDefault()}>
          <SidebarContent className="pt-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => (
                    <SidebarMenuItem key={link.id}>
                      <SidebarMenuButton
                        render={<Link href={link.id === "directory" ? "/people" : `/people?section=${link.id}`} replace />}
                        isActive={activeSection === link.id}
                        tooltip={link.label}
                        className="h-9 data-[active=true]:bg-[var(--color-brand-bg)] data-[active=true]:text-[var(--color-brand)] data-[active=true]:ring-[var(--color-brand-border)] transition-all ease-in-out duration-150"
                      >
                        <span className={activeSection === link.id ? "text-[var(--color-brand)] flex shrink-0 items-center justify-center transition-colors" : "text-[var(--color-text-faint)] flex shrink-0 items-center justify-center transition-colors"}>
                          {link.icon}
                        </span>
                        <span className="font-semibold">{link.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleSidebarOpenChange(!sidebarOpen)}
                  tooltip={sidebarOpen ? "Collapse Menu" : "Expand Menu"}
                  className="h-9 text-[var(--color-text-faint)] hover:text-black transition-all ease-in-out duration-150"
                >
                  <span className="flex shrink-0 items-center justify-center">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: sidebarOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                      <polyline points="13 17 18 12 13 7" />
                      <polyline points="6 17 11 12 6 7" />
                    </svg>
                  </span>
                  <span className="font-semibold ml-2">Collapse Menu</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      )}

      {/* SidebarInset — body handles scrolling, toolbar sticks below header */}
      <SidebarInset className="bg-[var(--color-bg)] dg-page-enter">
        {activeSection === "directory" && (
          <MembersSection
            employees={employees}
            benchedEmployees={benchedEmployees}
            terminatedEmployees={terminatedEmployees}
            focusAreas={focusAreas}
            certifications={certifications}
            roles={roles}
            onSave={onSave}
            onDelete={onDelete}
            onBench={onBench}
            onActivate={onActivate}
            onAdd={onAdd}
            canViewEmployeeDetails={canViewEmployeeDetails ?? false}
            canManageEmployees={canManageEmployees ?? false}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            roleLabel={roleLabel}
            orgId={orgId}
            orgName={orgName}
            isSuperAdmin={isSuperAdmin}
            isGridmaster={isGridmaster}
            departments={departmentsProp}
            departmentLabel={departmentLabelProp}
            setupIncomplete={setupIncomplete}
          />
        )}

        {activeSection !== "directory" && (
          <div className="p-4 md:p-6 lg:px-12 lg:py-10">
            {activeSection === "access" && (isSuperAdmin || isGridmaster) && orgId && (
              <div className="mx-auto" style={{ width: "100%", maxWidth: 1100 }}>
                <UserManagementSettings orgId={orgId} isSuperAdmin={isSuperAdmin} departments={departmentsProp as unknown as Department[]} />
              </div>
            )}

            {activeSection === "activity" && isSuperAdmin && orgId && (
              <div className="mx-auto" style={{ width: "100%", maxWidth: 1100 }}>
                <OrgActivityLog orgId={orgId} />
              </div>
            )}

            {activeSection === "recurring-schedule" && orgId && canViewRecurringShifts && (
              <RecurringScheduleSection
                employees={employees}
                orgId={orgId}
                currentUserId={user?.id ?? null}
                shiftCodes={shiftCodes ?? []}
                shiftCodeMap={shiftCodeMap ?? EMPTY_CODE_MAP}
                canManage={canManageRecurringShifts ?? false}
                focusAreas={focusAreas}
                certifications={certifications}
                absenceTypes={absenceTypes}
                shiftDisplayMode={shiftDisplayMode}
              />
            )}

          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

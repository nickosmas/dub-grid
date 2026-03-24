"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getInitials, getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor, DESIGNATION_COLORS, DEFAULT_DESIG_COLOR } from "@/lib/colors";
import { BOX_SHADOW_CARD, DAY_LABELS } from "@/lib/constants";
import { Employee, FocusArea, ShiftCode, NamedItem, Invitation } from "@/types";
import { useAuth } from "@/components/AuthProvider";
import { isEmployeeQualified } from "@/lib/schedule-logic";
import InlineEditEmployee from "@/components/EditEmployeePanel";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import * as db from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import CustomSelect, { SelectOption } from "./CustomSelect";
import ShiftPicker from "./ShiftPicker";
import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { useSetMobileSubNav, SubNavItem } from "@/components/MobileSubNavContext";
import { useStaffFilters, useStaffSelection, useStaffReorder, StaffTableRow, StaffEmptyState, StaffPagination, StaffDetailPanel, StaffToolbar, StaffFilterPopover, StaffContextBar } from "./staff";
import type { EmployeeTab } from "./staff";
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

type StaffSection = "members" | "recurring-schedule" | "focus-areas" | "certifications" | "roles";

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
  canEditShifts?: boolean;
  canManageEmployees?: boolean;
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  orgName?: string;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Employee avatar chip (used in Focus Areas & Roles sections) ───────────────
function EmpChip({ emp }: { emp: Employee }) {
  const { user: currentUser } = useAuth();
  const isYou = !!(emp.userId && currentUser && emp.userId === currentUser.id);
  const hue = hashCode(emp.id) % 360;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border-light)",
        borderRadius: 24,
        padding: "3px 10px 3px 4px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: `hsl(${hue}, 70%, 92%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--dg-fs-micro)",
          fontWeight: 800,
          color: `hsl(${hue}, 70%, 35%)`,
          flexShrink: 0,
          border: `1px solid hsl(${hue}, 70%, 85%)`,
        }}
      >
        {getInitials(getEmployeeDisplayName(emp))}
      </div>
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}
      >
        {getEmployeeDisplayName(emp)}
      </span>
      {isYou && (
        <span style={{
          fontSize: "var(--dg-fs-micro)", fontWeight: 700, padding: "1px 5px", borderRadius: 10,
          background: "var(--color-info-bg)", color: "var(--color-link)", whiteSpace: "nowrap",
        }}>
          You
        </span>
      )}
    </div>
  );
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
  canManageEmployees,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  orgId,
  orgName,
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
  canManageEmployees: boolean;
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  orgId?: string;
  orgName?: string;
}) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const { user: currentUser } = useAuth();
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  // ── Extracted hooks ──
  const filters = useStaffFilters({ employees, benchedEmployees, terminatedEmployees, focusAreas, showOnlyUnlinked });
  const { activeTab, setActiveTab, searchQuery, setSearchQuery, sortBy, setSortBy, filterFocusArea, setFilterFocusArea, filterRole, setFilterRole, hasActiveFilters, clearFilters: clearFiltersBase, rawList, sorted, paginatedList: filterPaginatedList, page, setPage, totalPages, totalCount, pageSize: PAGE_SIZE, tabCounts, unlinkedCount, unlinkedNoEmail } = filters;
  const clearFilters = useCallback(() => { clearFiltersBase(); setShowOnlyUnlinked(false); }, [clearFiltersBase]);
  const selection = useStaffSelection();
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = selection;
  const reorder = useStaffReorder({ sorted, onSave });
  const { isReordering, isDirty, enterReorder: handleEnterReorder, saveOrder: handleSaveOrder, cancelReorder: handleCancelReorder, draggedIdx, dragOverIdx, handleDragStart, handleDragOver, handleDrop, handleDragEnd, displayList, baseList } = reorder;

  // When reordering, paginate from displayList; otherwise use filter's paginated list
  const paginatedList = useMemo(
    () => isReordering ? displayList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : filterPaginatedList,
    [isReordering, displayList, filterPaginatedList, page, PAGE_SIZE],
  );

  // Reset selection and close detail when filters/tab change
  useEffect(() => { clearSelection(); setExpandedEmpId(null); }, [activeTab, searchQuery, filterFocusArea, filterRole, sortBy, showOnlyUnlinked, clearSelection]);

  // Invitation state
  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [inviteQueue, setInviteQueue] = useState<Employee[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Fetch pending invitations for badge display
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    db.fetchInvitations(orgId).then((invites) => {
      if (cancelled) return;
      setPendingInvitations(
        invites.filter((inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date())
      );
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [orgId]);

  const pendingInviteByEmployeeId = useMemo(() => {
    const map = new Map<string, Invitation>();
    for (const inv of pendingInvitations) {
      if (inv.employeeId) map.set(inv.employeeId, inv);
    }
    return map;
  }, [pendingInvitations]);

  function refreshInvitations() {
    if (!orgId) return;
    db.fetchInvitations(orgId).then((invites) => {
      setPendingInvitations(
        invites.filter((inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date())
      );
    }).catch(() => {});
  }

  async function handleRevokeInvitation(invitationId: string): Promise<boolean> {
    setRevokingId(invitationId);
    try {
      await db.revokeInvitation(invitationId);
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

  const gridCols = isMobile
    ? "36px 1fr 28px"
    : isTablet
      ? "36px 1.2fr 1fr 0.6fr 28px"
      : "48px 1.2fr 1fr 0.6fr 0.8fr 0.5fr 28px";

  const tabItems: { key: EmployeeTab; label: string; count: number; color: string }[] = [
    { key: "active", label: "Active", count: employees.length, color: "var(--color-today-text)" },
    { key: "benched", label: "Benched", count: benchedEmployees.length, color: "var(--color-warning)" },
    { key: "terminated", label: "Terminated", count: terminatedEmployees.length, color: "var(--color-danger)" },
  ];

  // Find the currently selected employee for the detail panel
  const selectedEmployee = expandedEmpId
    ? [...employees, ...benchedEmployees, ...terminatedEmployees].find((e) => e.id === expandedEmpId)
    : null;

  // Can reorder only when: active tab, seniority sort, no filters/search, canManageEmployees
  const canReorder = activeTab === "active" && sortBy === "seniority" && !searchQuery && !filterFocusArea && !filterRole && !showOnlyUnlinked && canManageEmployees;

  return (
    <>
      {/* ── Sticky header: toolbar + context bar ── */}
      <div className="sticky top-0 z-50">
      <StaffToolbar
        tabs={tabItems}
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setExpandedEmpId(null); if (isReordering) handleCancelReorder(); }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortBy={sortBy}
        onSortChange={setSortBy}
        canReorder={canReorder}
        onEnterReorder={() => { handleEnterReorder(); setExpandedEmpId(null); setPage(1); }}
        hasActiveFilters={hasActiveFilters}
        hasUnlinked={unlinkedCount > 0 && activeTab === "active"}
        isReordering={isReordering}
        canManageEmployees={canManageEmployees}
        showAdd={activeTab === "active"}
        onAdd={onAdd}
        onFilterToggle={() => setFilterOpen((v) => !v)}
        filterOpen={filterOpen}
        filterBtnRef={filterBtnRef}
      />

      {/* Context bar: filter pills, bulk actions, or reorder bar */}
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
      </div>

      {/* Filter popover */}
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

      {/* Content area with padding — below sticky toolbar */}
      <div
        className="px-4 md:px-6 lg:px-12 py-4 md:py-6 lg:py-10 pb-32"
      >
        {/* Table & Empty States */}
        {rawList.length > 0 ? (
          <>
          <div data-testid="staff-table" className="bg-white rounded-[14px] border border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-raised)]">
            {/* Header row */}
            <div
              className={`grid border-b border-[var(--color-border-light)] bg-[var(--color-row-alt)] ${isMobile ? "px-3 py-2.5" : "px-6 py-3"}`}
              style={{ gridTemplateColumns: gridCols }}
            >
            {(isMobile
              ? ["", "Name", ""]
              : isTablet
                ? ["", "Name", `Assigned ${focusAreaLabel}`, certificationLabel, ""]
                : ["", "Name", `Assigned ${focusAreaLabel}`, certificationLabel, "Roles", "Account", ""]
            ).map((h, i) => (
              <div
                key={i}
                className="text-[11px] font-bold text-[var(--color-text-subtle)] tracking-[0.06em] flex items-center gap-1.5"
              >
                {i === 0 && canManageEmployees && !isReordering && (
                  <input
                    type="checkbox"
                    checked={paginatedList.length > 0 && paginatedList.every((e) => selectedIds.has(e.id))}
                    onChange={() => toggleSelectAll(paginatedList)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-[var(--color-today-text)] cursor-pointer w-3.5 h-3.5"
                  />
                )}
                {h}
              </div>
            ))}
          </div>

          {/* Employee rows */}
          {paginatedList.map((emp, i) => {
            const globalIdx = (page - 1) * PAGE_SIZE + i;
            const isExpanded = !isReordering && emp.id === expandedEmpId;
            const isDragging = isReordering && draggedIdx !== null && baseList[draggedIdx]?.id === emp.id;
            const isDropTarget = isReordering && dragOverIdx === globalIdx && draggedIdx !== null && draggedIdx !== globalIdx;
            return (
              <StaffTableRow
                key={emp.id}
                emp={emp}
                index={i}
                globalIndex={globalIdx}
                isExpanded={isExpanded}
                isReordering={isReordering}
                isDragging={isDragging}
                isDropTarget={isDropTarget}
                canManageEmployees={canManageEmployees}
                isSelected={selectedIds.has(emp.id)}
                isMobile={isMobile}
                isTablet={isTablet}
                gridCols={gridCols}
                focusAreas={focusAreas}
                certifications={certifications}
                roles={roles}
                pendingInviteByEmployeeId={pendingInviteByEmployeeId}
                revokingId={revokingId}
                onToggleSelect={toggleSelect}
                onRowClick={(empId) => setExpandedEmpId(isExpanded ? null : empId)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onRevokeInvitation={handleRevokeInvitation}
              />
            );
          })}
          </div>

          {/* Pagination controls */}
          <StaffPagination
            page={page}
            totalPages={totalPages}
            totalCount={isReordering ? displayList.length : totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
          </>
        ) : (
          <StaffEmptyState
            activeTab={activeTab}
            hasFilters={!!(searchQuery || filterFocusArea || filterRole || showOnlyUnlinked)}
            onClearFilters={clearFilters}
          />
        )}

        {/* Invite Employee Modal */}
        {inviteEmployee && orgId && (
          <InviteEmployeeModal
            employee={inviteEmployee}
            orgId={orgId}
            orgName={orgName || "your organization"}
            onClose={() => { setInviteEmployee(null); setInviteQueue([]); }}
            onInvited={() => {
              refreshInvitations();
              if (inviteQueue.length > 0) {
                setInviteEmployee(inviteQueue[0]);
                setInviteQueue((q) => q.slice(1));
              } else {
                setInviteEmployee(null);
              }
            }}
          />
        )}
      </div>

      {/* Detail panel — fixed positioned, outside content flow */}
      {selectedEmployee && (
        <StaffDetailPanel
          employee={selectedEmployee}
          focusAreas={focusAreas}
          certifications={certifications}
          roles={roles}
          roleLabel={roleLabel}
          focusAreaLabel={focusAreaLabel}
          certificationLabel={certificationLabel}
          canManageEmployees={canManageEmployees}
          orgId={orgId}
          pendingInviteByEmployeeId={pendingInviteByEmployeeId}
          onSave={handleSave}
          onDelete={handleDelete}
          onBench={(empId, note) => onBench(empId, note)}
          onActivate={(empId) => onActivate(empId)}
          onClose={() => setExpandedEmpId(null)}
          onInvite={(e) => setInviteEmployee(e)}
          onRevoke={handleRevokeInvitation}
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
}: {
  anchorRef: HTMLElement | null;
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  currentLabel: string;
  onSelect: (label: string) => void;
  onClose: () => void;
  empFocusAreaIds: number[];
  empCertificationId?: number | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [arrowLeft, setArrowLeft] = useState(0);
  const [flippedUp, setFlippedUp] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    if (!anchorRef) return;
    const rect = anchorRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const flipUp = spaceBelow < 260;
    setFlippedUp(flipUp);
    const popoverWidth = Math.min(440, window.innerWidth - 16);
    const isMobileView = window.innerWidth < 768;
    const GAP = 8; // space between cell and popover (room for arrow)
    const popoverLeft = isMobileView ? 8 : Math.max(8, Math.min(rect.left + window.scrollX - 40, window.innerWidth - popoverWidth - 8));
    setMenuStyle({
      position: "absolute",
      top: flipUp ? undefined : rect.bottom + window.scrollY + GAP,
      bottom: flipUp ? window.innerHeight - rect.top - window.scrollY + GAP : undefined,
      left: isMobileView ? 8 : popoverLeft,
      width: isMobileView ? undefined : popoverWidth,
      right: isMobileView ? 8 : undefined,
      maxHeight: Math.min(flipUp ? rect.top - 12 : spaceBelow, 600),
      zIndex: 9999,
    });
    // Arrow: center on the anchor cell, relative to popover left
    const anchorCenterX = rect.left + window.scrollX + rect.width / 2;
    setArrowLeft(isMobileView
      ? anchorCenterX - 8
      : Math.max(16, Math.min(anchorCenterX - popoverLeft, popoverWidth - 16)));
  }, [anchorRef]);

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
    return currentLabel.split("/").map(l => shiftCodes.find(sc => sc.label === l)?.id).filter((id): id is number => id != null);
  }, [currentLabel, shiftCodes]);

  if (!mounted || !anchorRef) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...menuStyle,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
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
      <div style={{ overflow: "hidden", borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "inherit" }}>
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
            currentShiftCodeIds={currentShiftCodeIds}
            onSelect={(label) => {
              onSelect(label);
              onClose();
            }}
            empFocusAreaIds={empFocusAreaIds}
            empCertificationId={empCertificationId}
            multiSelect={false}
            closeOnSelect={true}
          />
          {currentLabel && (
            <button
              onClick={() => { onSelect(""); onClose(); }}
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
function RecurringScheduleSection({
  employees,
  orgId,
  shiftCodes,
  shiftCodeMap,
  canEdit,
  focusAreas,
  certifications,
}: {
  employees: Employee[];
  orgId: string;
  shiftCodes: ShiftCode[];
  shiftCodeMap: Map<number, string>;
  canEdit: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
}) {
  const isMobile = useMediaQuery(MOBILE);
  // ── Data state ──
  const [allSchedules, setAllSchedules] = useState<Record<string, Record<number, string>>>({});
  const [loading, setLoading] = useState(true);

  // ── Edit state ──
  const [dirtySchedules, setDirtySchedules] = useState<Record<string, Record<number, string>>>({});
  const { user: currentUser } = useAuth();
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
        const rows = await db.fetchRecurringShifts(orgId, undefined, shiftCodeMap);
        if (cancelled) return;

        const schedules: Record<string, Record<number, string>> = {};
        for (const rs of rows) {
          if (!schedules[rs.empId]) schedules[rs.empId] = {};
          if (!(rs.dayOfWeek in schedules[rs.empId])) {
            schedules[rs.empId][rs.dayOfWeek] = rs.shiftLabel;
          }
        }
        setAllSchedules(schedules);

        // Load saved draft separately so a draft error doesn't block the main data
        try {
          const draft = await db.getRecurringDraft(orgId);
          if (!cancelled && draft?.draftData && Object.keys(draft.draftData).length > 0) {
            setDirtySchedules(draft.draftData);
            setSavedDraftTimestamp(draft.savedAt);
          }
        } catch {
          // Draft recovery is non-critical — ignore errors
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId, shiftCodeMap]);

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
    if (!canEdit) return;
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
        for (const [dayStr, newLabel] of Object.entries(empDirty)) {
          const day = Number(dayStr);
          if (newLabel) {
            const sc = shiftCodes.find((s) => s.label === newLabel);
            if (!sc) {
              skippedLabels.push(newLabel);
              continue;
            }
            await db.upsertRecurringShift(empId, orgId, day, sc.id, todayKey);
          } else {
            await db.deleteRecurringShift(empId, day);
          }
          savedKeys.add(`${empId}:${dayStr}`);
        }
      }
      if (skippedLabels.length > 0) {
        const unique = [...new Set(skippedLabels)];
        toast.error(`Unknown shift code${unique.length > 1 ? "s" : ""}: ${unique.join(", ")}`);
      }
      // Re-fetch from DB so allSchedules reflects what was actually persisted
      const freshRows = await db.fetchRecurringShifts(orgId, undefined, shiftCodeMap);
      const freshSchedules: Record<string, Record<number, string>> = {};
      for (const rs of freshRows) {
        if (!freshSchedules[rs.empId]) freshSchedules[rs.empId] = {};
        if (!(rs.dayOfWeek in freshSchedules[rs.empId])) {
          freshSchedules[rs.empId][rs.dayOfWeek] = rs.shiftLabel;
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
      await db.deleteRecurringDraft(orgId).catch(() => {});
      toast.success("Recurring schedules saved");
    } catch (err: any) {
      toast.error("Failed to save recurring schedules");
      setError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast.error("Not authenticated"); return; }
      await db.saveRecurringDraft(orgId, userId, dirtySchedules);
      setSavedDraftTimestamp(new Date().toISOString());
      toast.success("Draft saved");
    } catch (err: any) {
      console.error("Draft save error:", err);
      toast.error(`Failed to save draft: ${err?.message ?? "Unknown error"}`);
    }
  }

  async function handleDiscardDraft() {
    setDirtySchedules({});
    setSavedDraftTimestamp(null);
    await db.deleteRecurringDraft(orgId).catch(() => {});
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

  // ── Get qualified shift codes per employee ──
  function getQualifiedCodes(emp: Employee) {
    return shiftCodes.filter((st) => isEmployeeQualified(emp, st));
  }

  // ── Find the employee for the active cell popover ──
  const activeCellEmp = activeCell ? employees.find((e) => e.id === activeCell.empId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Sticky save bar at top — shows when there are dirty changes (including restored drafts) */}
      {hasDirtyChanges && (
        <div style={{
          position: "sticky", top: 0, zIndex: 20,
          background: "var(--color-info-bg)", border: "1px solid var(--color-info-border)", borderRadius: 12,
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
              borderRadius: 10,
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
          background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)",
          padding: "48px 20px", textAlign: "center", color: "var(--color-text-subtle)", fontSize: "var(--dg-fs-label)",
        }}>
          Loading recurring schedules...
        </div>
      ) : employees.length === 0 ? (
        /* Empty state: no employees */
        <div style={{
          background: "var(--color-surface)", borderRadius: 12, border: "2px dashed var(--color-border-light)",
          padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: "var(--color-row-alt)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color: "var(--color-text-secondary)" }}>No staff members</div>
          <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
            Add employees in the Members section to set up recurring shifts.
          </div>
        </div>
      ) : sortedEmployees.length === 0 ? (
        /* Empty state: no filter results */
        <div style={{
          background: "var(--color-surface)", borderRadius: 12, border: "2px dashed var(--color-border-light)",
          padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 700, color: "var(--color-text-secondary)" }}>No results found</div>
          <div style={{ fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>Try adjusting your search or filter.</div>
          <button
            onClick={() => { setSearchQuery(""); setFilterFocusArea(""); }}
            style={{
              marginTop: 4, background: "none", border: "none", cursor: "pointer",
              fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-accent)", fontFamily: "inherit",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{
          background: "var(--color-surface)", borderRadius: 12, border: "1px solid var(--color-border)",
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
            const isCurrentUser = !!(emp.userId && currentUser && emp.userId === currentUser.id);
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
                          background: "var(--color-info-bg)", color: "var(--color-link)", whiteSpace: "nowrap", flexShrink: 0,
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
                  const label = getEffectiveLabel(emp.id, dayIdx);
                  const st = label ? shiftCodes.find((s) => s.label === label) : null;
                  const isDirty = !!(dirtySchedules[emp.id] && dayIdx in dirtySchedules[emp.id]);
                  const isActive = activeCell?.empId === emp.id && activeCell?.dayIndex === dayIdx;

                  return (
                    <div
                      key={dayIdx}
                      className="dg-grid-cell"
                      data-interactive={canEdit ? "true" : "false"}
                      tabIndex={canEdit ? 0 : -1}
                      role="gridcell"
                      aria-label={st ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[dayIdx]}: ${st.label}` : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[dayIdx]}: empty`}
                      onClick={(e) => handleCellClick(emp.id, dayIdx, e.currentTarget)}
                      onKeyDown={(e) => {
                        if (canEdit && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          handleCellClick(emp.id, dayIdx, e.currentTarget as HTMLElement);
                        }
                      }}
                      style={{
                        height: "var(--dg-grid-cell-height)",
                        borderLeft: "1px solid var(--color-border-light)",
                        background: isActive ? "rgba(56,189,248,0.08)" : undefined,
                      }}
                    >
                      {st ? (
                        <div style={{
                          position: "absolute", top: 4, right: 4, bottom: 4, left: 4,
                          background: st.color,
                          border: isDirty ? `2px dashed ${st.text}` : `1px solid ${borderColor(st.text)}`,
                          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          color: st.text,
                          fontSize: isMobile ? "var(--dg-fs-label)" : "var(--dg-fs-title)",
                          fontWeight: 800,
                          transition: "box-shadow 150ms ease",
                          boxShadow: isActive ? "0 0 0 2px rgba(56,189,248,0.3)" : "none",
                        }}>
                          {st.label}
                        </div>
                      ) : (
                        <div style={{
                          position: "absolute", top: 4, right: 4, bottom: 4, left: 4,
                          background: "transparent",
                          border: isDirty ? "2px dashed var(--color-text-subtle)" : "1px dashed var(--color-border-light)",
                          borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)", fontWeight: 500,
                          transition: "box-shadow 150ms ease, background 80ms ease",
                          boxShadow: isActive ? "0 0 0 2px rgba(56,189,248,0.3)" : "none",
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
      {activeCell && activeCellEmp && (
        <ShiftCellPopover
          anchorRef={activeCellEl}
          shiftCodes={shiftCodes}
          focusAreas={focusAreas}
          currentLabel={getEffectiveLabel(activeCell.empId, activeCell.dayIndex)}
          onSelect={(label) => handleCellChange(activeCell.empId, activeCell.dayIndex, label)}
          onClose={() => { setActiveCell(null); setActiveCellEl(null); }}
          empFocusAreaIds={activeCellEmp.focusAreaIds}
          empCertificationId={activeCellEmp.certificationId}
        />
      )}
    </div>
  );
}

// ── Focus Areas section ───────────────────────────────────────────────────────
function FocusAreasSection({
  employees,
  focusAreas,
  focusAreaLabel = "Focus Areas",
}: {
  employees: Employee[];
  focusAreas: FocusArea[];
  focusAreaLabel?: string;
}) {
  const grouped = useMemo(() => {
    return focusAreas.map((focusArea) => ({
      focusArea,
      members: employees.filter((e) => e.focusAreaIds.includes(focusArea.id))
        .sort((a, b) => a.seniority - b.seniority),
    }));
  }, [employees, focusAreas]);

  const unassigned = useMemo(
    () => employees.filter((e) => e.focusAreaIds.length === 0).sort((a, b) => a.seniority - b.seniority),
    [employees],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1100 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {focusAreaLabel}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {focusAreaLabel.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ focusArea, members }) => (
        <div
          key={focusArea.id}
          style={{
            background: "var(--color-surface)",
            borderRadius: 14,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: members.length > 0 ? "1px solid var(--color-border-light)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-secondary)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                borderRadius: 20,
                padding: "3px 10px",
                border: "1px solid var(--color-border-light)",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0 }} />
              {focusArea.name}
            </span>
            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-faint)", fontStyle: "italic" }}>
                No staff assigned to this {focusAreaLabel.replace(/s$/, "").toLowerCase()}.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map((emp) => (
                  <EmpChip key={emp.id} emp={emp} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: BOX_SHADOW_CARD,
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
            Unassigned
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unassigned.map((emp) => <EmpChip key={emp.id} emp={emp} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read-only Named Items Section (shared by Certifications & Roles) ─────────
function NamedItemsSection({
  employees,
  items,
  label = "Items",
  singularLabel = "Item",
  getEmployeeValues,
  pillStyle,
}: {
  employees: Employee[];
  items: NamedItem[];
  label?: string;
  singularLabel?: string;
  getEmployeeValues: (emp: Employee) => number[];
  pillStyle?: { bg: string; text: string };
}) {
  const grouped = useMemo(() => {
    return items.map((item) => ({
      item,
      members: employees.filter((e) => getEmployeeValues(e).includes(item.id))
        .sort((a, b) => a.seniority - b.seniority),
    }));
  }, [employees, items, getEmployeeValues]);

  const unassigned = useMemo(
    () => employees.filter((e) => getEmployeeValues(e).length === 0).sort((a, b) => a.seniority - b.seniority),
    [employees, getEmployeeValues],
  );

  const defaultPill = pillStyle ?? { bg: "var(--color-brand)", text: "var(--color-text-inverse)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1100 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {label}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {label.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ item, members }) => (
        <div
          key={item.id}
          style={{
            background: "var(--color-surface)",
            borderRadius: 14,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderBottom: members.length > 0 ? "1px solid var(--color-border-light)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                background: defaultPill.bg,
                color: defaultPill.text,
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {item.abbr}
            </span>
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {item.name !== item.abbr ? item.name : ""}
            </span>
            <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-faint)", fontStyle: "italic" }}>
                No staff with this {singularLabel.toLowerCase()}.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {members.map((emp) => (
                  <EmpChip key={emp.id} emp={emp} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: BOX_SHADOW_CARD,
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>
            Unassigned
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unassigned.map((emp) => <EmpChip key={emp.id} emp={emp} />)}
          </div>
        </div>
      )}
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
  canEditShifts,
  canManageEmployees,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certifications",
  roleLabel = "Roles",
  orgName,
}: StaffViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery(MOBILE);
  const VALID_SECTIONS: StaffSection[] = ["members", "recurring-schedule", "focus-areas", "certifications", "roles"];
  const sectionParam = searchParams.get("section") as StaffSection | null;
  const activeSection: StaffSection = sectionParam && VALID_SECTIONS.includes(sectionParam) ? sectionParam : "members";

  const iconUsers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconGrid = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
  const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
  const iconCert = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

  const links: { id: StaffSection; label: string; icon: React.ReactNode }[] = [
    { id: "members", label: "Staff Members", icon: iconUsers },
    ...(orgId ? [{ id: "recurring-schedule" as StaffSection, label: "Recurring Shifts", icon: iconCalendar }] : []),
    { id: "focus-areas", label: focusAreaLabel, icon: iconGrid },
    { id: "certifications", label: certificationLabel, icon: iconCert },
    { id: "roles", label: roleLabel, icon: iconTag },
  ];

  const getCertValues = useCallback((emp: Employee) => emp.certificationId != null ? [emp.certificationId] : [], []);
  const getRoleValues = useCallback((emp: Employee) => emp.roleIds, []);

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
        href: link.id === "members" ? "/staff" : `/staff?section=${link.id}`,
        active: activeSection === link.id,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSection, orgId, focusAreaLabel, certificationLabel, roleLabel],
  );
  useSetMobileSubNav(subNavItems);

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={handleSidebarOpenChange}
      style={{ minHeight: "unset", height: "calc(100dvh - 56px)" }}
    >
      {/* Sidebar — hidden on mobile (shown in bottom sheet), visible on desktop/tablet */}
      {!isMobile && (
        <Sidebar collapsible="icon" className="border-r border-[var(--color-border)] bg-[var(--color-surface)]" style={{ top: 56, height: "calc(100dvh - 56px)" }}>
          <SidebarContent className="pt-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {links.map((link) => (
                    <SidebarMenuItem key={link.id}>
                      <SidebarMenuButton
                        render={<Link href={link.id === "members" ? "/staff" : `/staff?section=${link.id}`} replace />}
                        isActive={activeSection === link.id}
                        tooltip={link.label}
                        className="h-9 data-[active=true]:bg-[var(--color-info-bg)] data-[active=true]:text-[var(--color-brand)] hover:bg-[var(--color-bg-secondary)] transition-all ease-in-out duration-150"
                      >
                        <span className={activeSection === link.id ? "text-[var(--color-today-text)] flex shrink-0 items-center justify-center transition-colors" : "text-[var(--color-text-faint)] flex shrink-0 items-center justify-center transition-colors"}>
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
                  className="h-9 text-[var(--color-text-faint)] hover:text-black hover:bg-[var(--color-bg-secondary)] transition-all ease-in-out duration-150"
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

      {/* SidebarInset = scroll container. Toolbar is a DIRECT child → sticky works */}
      <SidebarInset className="overflow-y-auto">
        {activeSection === "members" && (
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
            canManageEmployees={canManageEmployees ?? false}
            focusAreaLabel={focusAreaLabel}
            certificationLabel={certificationLabel}
            roleLabel={roleLabel}
            orgId={orgId}
            orgName={orgName}
          />
        )}

        {activeSection !== "members" && (
          <div className="p-4 md:p-6 lg:px-12 lg:py-10">
            {activeSection === "recurring-schedule" && orgId && (
              <RecurringScheduleSection
                employees={employees}
                orgId={orgId}
                shiftCodes={shiftCodes ?? []}
                shiftCodeMap={shiftCodeMap ?? EMPTY_CODE_MAP}
                canEdit={canEditShifts ?? false}
                focusAreas={focusAreas}
                certifications={certifications}
              />
            )}

            {activeSection === "focus-areas" && (
              <FocusAreasSection
                employees={employees}
                focusAreas={focusAreas}
                focusAreaLabel={focusAreaLabel}
              />
            )}

            {activeSection === "certifications" && (
              <NamedItemsSection
                employees={employees}
                items={certifications}
                label={certificationLabel}
                singularLabel={certificationLabel.replace(/s$/, "")}
                getEmployeeValues={getCertValues}
                pillStyle={{ bg: "var(--color-border-light)", text: "var(--color-text-muted)" }}
              />
            )}

            {activeSection === "roles" && (
              <NamedItemsSection
                employees={employees}
                items={roles}
                label={roleLabel}
                singularLabel={roleLabel.replace(/s$/, "")}
                getEmployeeValues={getRoleValues}
              />
            )}
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

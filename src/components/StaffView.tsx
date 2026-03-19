"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getInitials, getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor } from "@/lib/colors";
import { BOX_SHADOW_CARD } from "@/lib/constants";
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

// ── Sidebar link (mirrors SettingsPage) ───────────────────────────────────────
function SidebarLink({
  label,
  icon,
  active,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  href: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      replace
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        background: active
          ? "var(--color-surface-overlay)"
          : hovered
          ? "rgba(0,0,0,0.03)"
          : "transparent",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active
          ? "var(--color-text-primary)"
          : "var(--color-text-muted)",
        textAlign: "left",
        fontFamily: "inherit",
        textDecoration: "none",
        transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
      }}
    >
      {active && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "20%",
            height: "60%",
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: "var(--color-accent-gradient)",
            boxShadow: "0 0 8px rgba(56, 189, 248, 0.4)",
          }}
        />
      )}
      <span
        style={{
          color: active
            ? "var(--color-today-text)"
            : "var(--color-text-faint)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          transition: "color 150ms ease",
        }}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
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
        background: "#fff",
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
          fontSize: 9,
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
          fontSize: 12,
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
          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10,
          background: "#EFF6FF", color: "#2563EB", whiteSpace: "nowrap",
        }}>
          You
        </span>
      )}
    </div>
  );
}

// ── Members section (the existing staff table) ────────────────────────────────
type EmployeeTab = "active" | "benched" | "terminated";

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
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<EmployeeTab>("active");
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "seniority" | "focusArea">("seniority");
  const [isReordering, setIsReordering] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<Employee[] | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Invitation state
  const [inviteEmployee, setInviteEmployee] = useState<Employee | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);

  // Fetch pending invitations for badge display
  useEffect(() => {
    if (!orgId) return;
    db.fetchInvitations(orgId).then((invites) => {
      setPendingInvitations(
        invites.filter((inv) => !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date())
      );
    }).catch(() => { /* silently ignore — badges just won't show */ });
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

  // Search, Filter, and Pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFocusArea, setFilterFocusArea] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(empId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  }

  function toggleSelectAll(list: Employee[]) {
    const allSelected = list.every((e) => selectedIds.has(e.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.map((e) => e.id)));
    }
  }

  function clearSelection() { setSelectedIds(new Set()); }

  // Reset to page 1 and clear selection when filters/sort/tab change
  useEffect(() => { setPage(1); clearSelection(); }, [activeTab, searchQuery, filterFocusArea, filterRole, sortBy]);

  const rawList = useMemo(() => {
    const list = activeTab === "active" ? employees : activeTab === "benched" ? benchedEmployees : terminatedEmployees;
    return list.filter(emp => {
      const matchesSearch = !searchQuery || 
        getEmployeeDisplayName(emp).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.email && emp.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.phone && emp.phone.includes(searchQuery));
      
      const matchesFocusArea = !filterFocusArea || emp.focusAreaIds.includes(filterFocusArea);
      const matchesRole = !filterRole || emp.roleIds.includes(filterRole);

      return matchesSearch && matchesFocusArea && matchesRole;
    });
  }, [activeTab, employees, benchedEmployees, terminatedEmployees, searchQuery, filterFocusArea, filterRole]);

  const sorted = useMemo(
    () =>
      [...rawList].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
          case "focusArea": {
            const faA = focusAreas.find(f => f.id === a.focusAreaIds[0])?.name ?? "";
            const faB = focusAreas.find(f => f.id === b.focusAreaIds[0])?.name ?? "";
            return faA !== faB ? faA.localeCompare(faB) : a.seniority - b.seniority;
          }
          default:
            return a.seniority - b.seniority;
        }
      }),
    [rawList, sortBy, focusAreas],
  );

  const baseList = isReordering && pendingOrder !== null ? pendingOrder : sorted;

  const displayList = useMemo(() => {
    if (!isReordering || draggedIdx === null || dragOverIdx === null) return baseList;
    const list = [...baseList];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    return list;
  }, [baseList, draggedIdx, dragOverIdx, isReordering]);

  const totalPages = Math.ceil(displayList.length / PAGE_SIZE);
  const paginatedList = useMemo(
    () => displayList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayList, page],
  );

  const handleEnterReorder = useCallback(() => {
    setIsReordering(true);
    setPendingOrder([...sorted]);
    setExpandedEmpId(null);
  }, [sorted]);

  const handleSaveOrder = useCallback(() => {
    if (!pendingOrder) return;
    pendingOrder.forEach((emp, i) => {
      if (emp.seniority !== i + 1) {
        onSave({ ...emp, seniority: i + 1 });
      }
    });
    setIsReordering(false);
    setPendingOrder(null);
  }, [pendingOrder, onSave]);

  const handleCancelReorder = useCallback(() => {
    setIsReordering(false);
    setPendingOrder(null);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDragStart = useCallback((idx: number) => {
    setDraggedIdx(idx);
    setDragOverIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback(() => {
    if (draggedIdx === null || dragOverIdx === null || !pendingOrder) return;
    const list = [...pendingOrder];
    const [item] = list.splice(draggedIdx, 1);
    list.splice(dragOverIdx, 0, item);
    setPendingOrder(list);
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, [draggedIdx, dragOverIdx, pendingOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleSave = useCallback(
    (emp: Employee) => {
      onSave(emp);
      setExpandedEmpId(null);
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

  const isDirty = useMemo(() => {
    if (!isReordering || !pendingOrder) return false;
    return pendingOrder.some((emp, i) => emp.id !== sorted[i]?.id);
  }, [isReordering, pendingOrder, sorted]);

  const gridCols = "48px 1.2fr 1fr 0.6fr 0.8fr 0.5fr 28px";

  const tabItems: { key: EmployeeTab; label: string; count: number; color: string }[] = [
    { key: "active", label: "Active", count: employees.length, color: "var(--color-today-text)" },
    { key: "benched", label: "Benched", count: benchedEmployees.length, color: "var(--color-warning)" },
    { key: "terminated", label: "Terminated", count: terminatedEmployees.length, color: "var(--color-danger)" },
  ];

  const unlinkedActive = employees.filter((e) => !e.userId);
  const unlinkedCount = unlinkedActive.length;
  const unlinkedNoEmail = unlinkedActive.filter((e) => !e.email).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Unlinked accounts banner */}
      {canManageEmployees && unlinkedCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ fontSize: 13, color: "#92400E" }}>
            <strong>{unlinkedCount} staff member{unlinkedCount !== 1 ? "s" : ""}</strong>{" "}
            {unlinkedCount !== 1 ? "don't" : "doesn't"} have a linked account.
            {unlinkedNoEmail > 0 && <>{" "}<strong>{unlinkedNoEmail}</strong> still need{unlinkedNoEmail === 1 ? "s" : ""} an email address added before they can be invited.</>}
            {" "}Expand a row and click <strong>Invite</strong> to send an invitation or link an existing account.
          </span>
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border)" }}>
        {tabItems.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedEmpId(null); if (isReordering) handleCancelReorder(); }}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? tab.color : "var(--color-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: -1,
                transition: "color 120ms ease, border-color 120ms ease",
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: isActive ? `${tab.color}15` : "var(--color-border-light)",
                  color: isActive ? tab.color : "var(--color-text-faint)",
                  borderRadius: 10,
                  padding: "1px 7px",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", padding: "4px 0", position: "relative" }}>
        {/* Reorder hint — stretches to fill all space left of the right-group buttons */}
        {isReordering && (
          <div style={{
            position: "absolute",
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 10,
            padding: "10px 20px",
            marginRight: isDirty ? 160 : 90,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF" }}>
              Drag rows to reorder seniority
            </span>
          </div>
        )}
        {/* Left group: dropdowns (hidden but in DOM during reorder to preserve height) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", visibility: isReordering ? "hidden" : "visible" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", whiteSpace: "nowrap" }}>Sort</span>
          <CustomSelect
            value={filterFocusArea ?? ""}
            options={[
              { value: "", label: `All ${focusAreaLabel}` },
              ...focusAreas.map(fa => ({ value: fa.id, label: fa.name }))
            ]}
            onChange={(val: string | number) => setFilterFocusArea(val ? Number(val) : null)}
            style={{ width: "auto", minWidth: 140 }}
            fontSize={12}
          />
          <CustomSelect
            value={filterRole ?? ""}
            options={[
              { value: "", label: `All ${roleLabel}` },
              ...roles.map(r => ({ value: r.id, label: r.name }))
            ]}
            onChange={(val: string | number) => setFilterRole(val ? Number(val) : null)}
            style={{ width: "auto", minWidth: 140 }}
            fontSize={12}
          />
          <CustomSelect
            value={sortBy}
            options={[
              { value: "seniority" as const, label: "Seniority" },
              { value: "name" as const, label: "Name" },
              { value: "focusArea" as const, label: focusAreaLabel },
            ]}
            onChange={(val) => { setSortBy(val as "seniority" | "name" | "focusArea"); }}
            style={{ width: "auto", minWidth: 120 }}
            fontSize={12}
          />
          {(searchQuery || filterFocusArea || filterRole) && (
            <button
              onClick={() => { setSearchQuery(""); setFilterFocusArea(null); setFilterRole(null); }}
              style={{
                background: "none", border: "none", color: "var(--color-today-text)", fontSize: 12,
                fontWeight: 600, cursor: "pointer", padding: "4px 8px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right group: search, reorder, add */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative", zIndex: 1 }}>
          {!isReordering && (
            <div style={{ position: "relative", minWidth: 180, maxWidth: 240 }}>
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-faint)" }}
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dg-input"
                style={{ paddingLeft: 32, fontSize: 12, background: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}
              />
            </div>
          )}

          {activeTab === "active" && sortBy === "seniority" && !searchQuery && !filterFocusArea && !filterRole && !isReordering && canManageEmployees && (
            <button
              onClick={handleEnterReorder}
              className="dg-btn"
              style={{ padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5, background: "var(--color-surface)", border: "1px solid var(--color-border-light)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 15 12 20 17 15" />
                <polyline points="7 9 12 4 17 9" />
              </svg>
              Reorder
            </button>
          )}
          {isReordering && isDirty && (
            <button onClick={handleSaveOrder} className="dg-btn dg-btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>
              Save
            </button>
          )}
          {isReordering && (
            <button onClick={handleCancelReorder} className="dg-btn dg-btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }}>
              Cancel
            </button>
          )}

          {!isReordering && activeTab === "active" && canManageEmployees && (
            <button
              onClick={onAdd}
              className="dg-btn dg-btn-primary"
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && canManageEmployees && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF" }}>
            {selectedIds.size} selected
          </span>
          <div style={{ flex: 1 }} />
          {activeTab === "active" && (() => {
            const invitable = displayList.filter(
              (e) => selectedIds.has(e.id) && e.email && !e.userId && !pendingInviteByEmployeeId.has(e.id)
            );
            return invitable.length > 0 ? (
              <button
                className="dg-btn dg-btn-ghost"
                style={{ fontSize: 12, fontWeight: 600, color: "#2563EB", border: "1px solid #BFDBFE", padding: "5px 12px" }}
                onClick={() => {
                  invitable.forEach((emp) => setInviteEmployee(emp));
                  // For bulk, open the first one; user can process one by one
                  setInviteEmployee(invitable[0]);
                }}
              >
                Invite ({invitable.length})
              </button>
            ) : null;
          })()}
          {activeTab === "active" && (
            <button
              className="dg-btn dg-btn-ghost"
              style={{ fontSize: 12, fontWeight: 600, color: "#D97706", border: "1px solid #FDE68A", padding: "5px 12px" }}
              onClick={async () => {
                const ids = [...selectedIds];
                for (const id of ids) { onBench(id); }
                clearSelection();
              }}
            >
              Bench ({selectedIds.size})
            </button>
          )}
          {activeTab === "benched" && (
            <button
              className="dg-btn dg-btn-ghost"
              style={{ fontSize: 12, fontWeight: 600, color: "#059669", border: "1px solid #D1FAE5", padding: "5px 12px" }}
              onClick={async () => {
                const ids = [...selectedIds];
                for (const id of ids) { onActivate(id); }
                clearSelection();
              }}
            >
              Activate ({selectedIds.size})
            </button>
          )}
          <button
            className="dg-btn dg-btn-ghost"
            style={{ fontSize: 12, fontWeight: 600, color: "var(--color-error)", border: "1px solid #FEE2E2", padding: "5px 12px" }}
            onClick={async () => {
              const ids = [...selectedIds];
              for (const id of ids) { onDelete(id); }
              clearSelection();
            }}
          >
            Terminate ({selectedIds.size})
          </button>
          <button
            className="dg-btn dg-btn-ghost"
            style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "5px 12px" }}
            onClick={clearSelection}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table & Empty States */}
      {rawList.length > 0 ? (
        <>
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              padding: "12px 24px",
              borderBottom: "1px solid var(--color-border-light)",
              background: "var(--color-row-alt)",
            }}
          >
          {["", "Name", `Assigned ${focusAreaLabel}`, certificationLabel, "Roles", "Account", ""].map((h, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {i === 0 && canManageEmployees && !isReordering && (
                <input
                  type="checkbox"
                  checked={displayList.length > 0 && displayList.every((e) => selectedIds.has(e.id))}
                  onChange={() => toggleSelectAll(displayList)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ accentColor: "var(--color-today-text)", cursor: "pointer", width: 14, height: 14 }}
                />
              )}
              {h}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        {paginatedList.map((emp, i) => {
          const isExpanded = !isReordering && emp.id === expandedEmpId;
          const isDragging = isReordering && draggedIdx !== null && baseList[draggedIdx]?.id === emp.id;
          const isDropTarget = isReordering && dragOverIdx === i && draggedIdx !== null && draggedIdx !== i;
          return (
            <div key={emp.id}>
              <div
                draggable={isReordering}
                onDragStart={isReordering ? () => handleDragStart(i) : undefined}
                onDragOver={isReordering ? (e) => handleDragOver(e, i) : undefined}
                onDrop={isReordering ? handleDrop : undefined}
                onDragEnd={isReordering ? handleDragEnd : undefined}
                onClick={!isReordering && canManageEmployees ? () => setExpandedEmpId(isExpanded ? null : emp.id) : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  padding: "14px 24px",
                  borderTop: isDropTarget
                    ? "2px solid #3B82F6"
                    : i === 0
                      ? "none"
                      : "1px solid var(--color-border-light)",
                  alignItems: "center",
                  background: isExpanded
                    ? "var(--color-today-bg)"
                    : "#fff",
                  cursor: isReordering ? "grab" : canManageEmployees ? "pointer" : "default",
                  transition: "all 0.15s ease",
                  opacity: isDragging ? 0.4 : 1,
                  borderLeft: isExpanded ? "4px solid var(--color-today-text)" : "4px solid transparent",
                  paddingLeft: "calc(24px - 4px)",
                  position: "relative",
                  zIndex: isExpanded ? 1 : 0,
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isReordering) {
                    e.currentTarget.style.background = "var(--color-row-alt)";
                    e.currentTarget.style.transform = "translateZ(0)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded && !isReordering) {
                    e.currentTarget.style.background = "#fff";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-faint)" }}>
                  {isReordering && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{ flexShrink: 0 }}>
                      <rect x="3" y="2" width="2" height="2" rx="1"/>
                      <rect x="9" y="2" width="2" height="2" rx="1"/>
                      <rect x="3" y="6" width="2" height="2" rx="1"/>
                      <rect x="9" y="6" width="2" height="2" rx="1"/>
                      <rect x="3" y="10" width="2" height="2" rx="1"/>
                      <rect x="9" y="10" width="2" height="2" rx="1"/>
                    </svg>
                  )}
                  {canManageEmployees && !isReordering && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleSelect(emp.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: "var(--color-today-text)", cursor: "pointer", width: 14, height: 14 }}
                    />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{(page - 1) * PAGE_SIZE + i + 1}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: `hsl(${hashCode(emp.id) % 360}, 70%, 92%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 800,
                        color: `hsl(${hashCode(emp.id) % 360}, 70%, 35%)`,
                        flexShrink: 0,
                        border: `1px solid hsl(${hashCode(emp.id) % 360}, 70%, 85%)`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      {getInitials(getEmployeeDisplayName(emp))}
                    </div>
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: "var(--color-text-secondary)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {getEmployeeDisplayName(emp)}
                      {emp.userId && currentUser && emp.userId === currentUser.id && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 10,
                          background: "#EFF6FF",
                          color: "#2563EB",
                          whiteSpace: "nowrap",
                        }}>
                          You
                        </span>
                      )}
                    </div>
                    {(emp.email || emp.phone) && (
                      <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 1 }}>
                        {emp.email || emp.phone}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {emp.focusAreaIds.map((faId) => {
                    const fa = focusAreas.find(f => f.id === faId);
                    if (!fa) return null;
                    const fc = { bg: fa.colorBg, text: fa.colorText };
                    return (
                      <span
                        key={faId}
                        style={{
                          background: fc.bg,
                          color: fc.text,
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 20,
                          padding: "2px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fa.name}
                      </span>
                    );
                  })}
                </div>

                <div>
                  <span
                    style={{
                      background: "var(--color-border-light)",
                      color: "var(--color-text-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "3px 9px",
                    }}
                  >
                    {getCertAbbr(emp.certificationId, certifications)}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                  {emp.roleIds.length > 0 ? getRoleAbbrs(emp.roleIds, roles).join(", ") : "—"}
                </div>

                {/* Account status column */}
                <div style={{ display: "flex", alignItems: "center" }}>
                  {emp.userId ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "#DCFCE7",
                      color: "#166534",
                      whiteSpace: "nowrap",
                    }}>
                      Linked
                    </span>
                  ) : pendingInviteByEmployeeId.has(emp.id) ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "#FEF3C7",
                      color: "#92400E",
                      whiteSpace: "nowrap",
                    }}>
                      Invited
                    </span>
                  ) : emp.email ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "#FEE2E2",
                      color: "#991B1B",
                      whiteSpace: "nowrap",
                    }}>
                      Not invited
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "var(--color-border-light)",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                    }}>
                      No email
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-faint)",
                    transform: isExpanded ? "rotate(180deg)" : "none",
                    transition: "transform 0.15s",
                    userSelect: "none",
                    visibility: isReordering ? "hidden" : "visible",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--color-border-light)",
                    borderLeft: "4px solid #2563EB",
                    background: "#FAFBFF",
                  }}
                >
                  <InlineEditEmployee
                    employee={emp}
                    focusAreas={focusAreas}
                    certifications={certifications}
                    roles={roles}
                    roleLabel={roleLabel}
                    focusAreaLabel={focusAreaLabel}
                    certificationLabel={certificationLabel}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onBench={(empId, note) => { onBench(empId, note); setExpandedEmpId(null); }}
                    onActivate={(empId) => { onActivate(empId); setExpandedEmpId(null); }}
                    onCancel={() => setExpandedEmpId(null)}
                    onInvite={canManageEmployees && orgId && !pendingInviteByEmployeeId.has(emp.id) ? (e) => { setExpandedEmpId(null); setInviteEmployee(e); } : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            fontSize: 13,
            color: "var(--color-text-muted)",
          }}>
            <span style={{ fontSize: 12 }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayList.length)} of {displayList.length}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="dg-btn"
                style={{ padding: "5px 12px", fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="dg-btn"
                style={{ padding: "5px 12px", fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
      ) : (
        /* Empty state with dashed borders */
        <div style={{
          padding: "64px 24px",
          textAlign: "center",
          background: "#fff",
          borderRadius: 14,
          border: "2px dashed var(--color-border-light)",
          color: "var(--color-text-muted)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
        }}>
          <div style={{
            color: "var(--color-text-faint)",
            background: "var(--color-bg)",
            padding: "16px 20px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.04)"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
              {searchQuery || filterFocusArea || filterRole ? "No results found" : (activeTab === "active" ? "No active employees" : activeTab === "benched" ? "No benched employees" : "No terminated employees")}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
              {searchQuery || filterFocusArea || filterRole ? "Try adjusting your search or filters." : "Get started by adding your first staff member."}
            </p>
          </div>
          {(searchQuery || filterFocusArea || filterRole) && (
            <button
              onClick={() => { setSearchQuery(""); setFilterFocusArea(null); setFilterRole(null); }}
              className="dg-btn dg-btn-secondary"
              style={{ marginTop: 8 }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Invite Employee Modal */}
      {inviteEmployee && orgId && (
        <InviteEmployeeModal
          employee={inviteEmployee}
          orgId={orgId}
          orgName={orgName || "your organization"}
          onClose={() => setInviteEmployee(null)}
          onInvited={() => {
            setInviteEmployee(null);
            refreshInvitations();
          }}
        />
      )}
    </div>
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (anchorRef) {
      const rect = anchorRef.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const flipUp = spaceBelow < 260;
      setMenuStyle({
        position: "absolute",
        top: flipUp ? undefined : rect.bottom + window.scrollY + 4,
        bottom: flipUp ? window.innerHeight - rect.top - window.scrollY + 4 : undefined,
        left: Math.max(8, rect.left + window.scrollX - 40),
        width: 440,
        maxHeight: Math.min(flipUp ? rect.top - 12 : spaceBelow, 800),
        zIndex: 9999,
      });
    }
  }, [anchorRef]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && anchorRef && !anchorRef.contains(target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

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
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "12px 12px 8px", fontSize: 11, fontWeight: 700, color: "var(--color-text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--color-border-light)" }}>
        Select Shift
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
    try {
      for (const [empId, empDirty] of Object.entries(dirtySchedules)) {
        for (const [dayStr, newLabel] of Object.entries(empDirty)) {
          const day = Number(dayStr);
          if (newLabel) {
            const sc = shiftCodes.find((s) => s.label === newLabel);
            if (!sc) continue;
            await db.upsertRecurringShift(empId, orgId, day, sc.id, todayKey);
          } else {
            await db.deleteRecurringShift(empId, day);
          }
        }
      }
      // Re-fetch from DB to keep both allSchedules and allRecurringShifts in sync
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
      setDirtySchedules({});
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
          background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10,
          padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1E40AF" }}>
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {savedDraftTimestamp && (
                <span style={{ fontSize: 11, color: "#3B82F6", opacity: 0.75 }}>
                  Draft saved {new Date(savedDraftTimestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveDraft}
              className="dg-btn"
              style={{ padding: "6px 14px", fontSize: 12 }}
            >
              Save Draft
            </button>
            <button
              onClick={handleDiscardDraft}
              className="dg-btn"
              style={{ padding: "6px 14px", fontSize: 12, color: "#DC2626" }}
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="dg-btn dg-btn-primary"
              style={{ padding: "6px 18px", fontSize: 12 }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          Recurring Shifts
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Set recurring shift patterns for each staff member. Click any cell to assign a shift.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {focusAreas.length > 0 && (
          <CustomSelect
            value={filterFocusArea}
            options={focusAreaOptions}
            onChange={setFilterFocusArea}
            fontSize={12}
            style={{ minWidth: 160 }}
          />
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
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
              fontSize: 12,
              outline: "none",
              width: 180,
              background: "#fff",
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
          background: "#fff", borderRadius: 14, border: "1px solid var(--color-border)",
          padding: "40px 20px", textAlign: "center", color: "var(--color-text-subtle)", fontSize: 13,
        }}>
          Loading recurring schedules...
        </div>
      ) : employees.length === 0 ? (
        /* Empty state: no employees */
        <div style={{
          background: "#fff", borderRadius: 14, border: "2px dashed var(--color-border-light)",
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
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-secondary)" }}>No staff members</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Add employees in the Members section to set up recurring shifts.
          </div>
        </div>
      ) : sortedEmployees.length === 0 ? (
        /* Empty state: no filter results */
        <div style={{
          background: "#fff", borderRadius: 14, border: "2px dashed var(--color-border-light)",
          padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-secondary)" }}>No results found</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Try adjusting your search or filter.</div>
          <button
            onClick={() => { setSearchQuery(""); setFilterFocusArea(""); }}
            style={{
              marginTop: 4, background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "var(--color-accent)", fontFamily: "inherit",
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1px solid var(--color-border)",
          overflow: "hidden", boxShadow: "var(--shadow-raised)", position: "relative",
        }}>
          {/* Header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "200px repeat(7, 1fr)",
            background: "var(--color-row-alt)",
            borderBottom: "1px solid var(--color-border-light)",
          }}>
            <div style={{
              padding: "10px 16px", fontSize: 10, fontWeight: 700, color: "var(--color-text-subtle)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              Staff
            </div>
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                style={{
                  padding: "10px 4px", fontSize: 10, fontWeight: 700, color: "var(--color-text-faint)",
                  textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Employee rows */}
          {sortedEmployees.map((emp, i) => {
            const qualifiedCodes = getQualifiedCodes(emp);
            return (
              <div
                key={emp.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px repeat(7, 1fr)",
                  borderTop: i === 0 ? "none" : "1px solid var(--color-border-light)",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--color-row-alt)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                }}
              >
                {/* Name cell */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                  borderRight: "1px solid var(--color-border-light)",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: `hsl(${hashCode(emp.id) % 360}, 70%, 92%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    color: `hsl(${hashCode(emp.id) % 360}, 70%, 35%)`,
                    border: `1px solid hsl(${hashCode(emp.id) % 360}, 70%, 85%)`,
                  }}>
                    {getInitials(getEmployeeDisplayName(emp))}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 13, color: "var(--color-text-secondary)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      {getEmployeeDisplayName(emp)}
                      {emp.userId && currentUser && emp.userId === currentUser.id && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                          background: "#EFF6FF", color: "#2563EB", whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          You
                        </span>
                      )}
                    </div>
                    {emp.certificationId != null && (
                      <div style={{ fontSize: 10, color: "var(--color-text-faint)", marginTop: 1 }}>
                        {getCertAbbr(emp.certificationId, certifications)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Day cells */}
                {DAY_NAMES.map((_, dayIdx) => {
                  const label = getEffectiveLabel(emp.id, dayIdx);
                  const st = label ? shiftCodes.find((s) => s.label === label) : null;
                  const isDirty = !!(dirtySchedules[emp.id] && dayIdx in dirtySchedules[emp.id]);
                  const isActive = activeCell?.empId === emp.id && activeCell?.dayIndex === dayIdx;

                  return (
                    <div
                      key={dayIdx}
                      onClick={(e) => handleCellClick(emp.id, dayIdx, e.currentTarget)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "6px 4px",
                        cursor: canEdit ? "pointer" : "default",
                        position: "relative",
                        borderLeft: "1px solid var(--color-border-light)",
                        background: isActive ? "rgba(56,189,248,0.08)" : undefined,
                      }}
                    >
                      {st ? (
                        <div style={{
                          width: "100%", maxWidth: 64, height: 32,
                          background: st.color,
                          border: isDirty ? `2px dashed ${st.text}` : `1px solid ${borderColor(st.text)}`,
                          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                          color: st.text, fontSize: 13, fontWeight: 800,
                          transition: "box-shadow 0.12s",
                          boxShadow: isActive ? "0 0 0 2px rgba(56,189,248,0.3)" : undefined,
                        }}>
                          {st.label}
                        </div>
                      ) : (
                        <div style={{
                          width: "100%", maxWidth: 64, height: 32,
                          background: "#F8FAFC",
                          border: isDirty ? "2px dashed #94A3B8" : "1px solid var(--color-border-light)",
                          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--color-text-faint)", fontSize: 12, fontWeight: 500,
                          transition: "box-shadow 0.12s",
                          boxShadow: isActive ? "0 0 0 2px rgba(56,189,248,0.3)" : undefined,
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
              padding: "10px 20px", background: "#FEF2F2", borderTop: "1px solid #FECACA",
              fontSize: 12, color: "#DC2626",
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
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {focusAreaLabel}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {focusAreaLabel.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ focusArea, members }) => (
        <div
          key={focusArea.id}
          style={{
            background: "#fff",
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
                background: focusArea.colorBg,
                color: focusArea.colorText,
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {focusArea.name}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-faint)", fontStyle: "italic" }}>
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
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: BOX_SHADOW_CARD,
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: 13, color: "var(--color-text-muted)" }}>
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

  const defaultPill = pillStyle ?? { bg: "var(--color-dark)", text: "#fff" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 1100 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {label}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
          Staff members grouped by their assigned {label.toLowerCase()}. Edit assignments from the Members tab.
        </p>
      </div>

      {grouped.map(({ item, members }) => (
        <div
          key={item.name}
          style={{
            background: "#fff",
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
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              {item.abbr}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {item.name !== item.abbr ? item.name : ""}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {members.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-faint)", fontStyle: "italic" }}>
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
            background: "#fff",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            boxShadow: BOX_SHADOW_CARD,
          }}
        >
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--color-border-light)", fontWeight: 700, fontSize: 13, color: "var(--color-text-muted)" }}>
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
  const VALID_SECTIONS: StaffSection[] = ["members", "recurring-schedule", "focus-areas", "certifications", "roles"];
  const sectionFromPath = pathname.split("/")[2] as StaffSection | undefined;
  const activeSection: StaffSection = sectionFromPath && VALID_SECTIONS.includes(sectionFromPath) ? sectionFromPath : "members";

  const iconUsers = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  const iconCalendar = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  const iconGrid = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
  const iconTag = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
  const iconCert = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

  const links: { id: StaffSection; label: string; icon: React.ReactNode }[] = [
    { id: "members", label: "Members", icon: iconUsers },
    ...(orgId ? [{ id: "recurring-schedule" as StaffSection, label: "Recurring Shifts", icon: iconCalendar }] : []),
    { id: "focus-areas", label: focusAreaLabel, icon: iconGrid },
    { id: "certifications", label: certificationLabel, icon: iconCert },
    { id: "roles", label: roleLabel, icon: iconTag },
  ];

  const getCertValues = useCallback((emp: Employee) => emp.certificationId != null ? [emp.certificationId] : [], []);
  const getRoleValues = useCallback((emp: Employee) => emp.roleIds, []);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          height: "100%",
          borderRight: "1px solid var(--color-border)",
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          padding: "24px 12px",
          gap: 4,
          overflowY: "auto",
        }}
      >
        {links.map((link) => (
          <SidebarLink
            key={link.id}
            label={link.label}
            icon={link.icon}
            active={activeSection === link.id}
            href={link.id === "members" ? "/staff" : `/staff/${link.id}`}
          />
        ))}
      </aside>

      {/* Content */}
      <div style={{ flex: 1, height: "100%", overflowY: "auto", padding: "40px 48px", display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
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
    </div>
  );
}

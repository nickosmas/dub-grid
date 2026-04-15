"use client";

import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import type { EmployeeTab } from "./useStaffFilters";

interface StaffContextBarProps {
  // Filter state
  filterFocusArea: number | null;
  filterRole: number | null;
  hasActiveFilters: boolean;
  onClearFocusArea: () => void;
  onClearRole: () => void;
  onClearAll: () => void;
  // Metadata for labels
  focusAreas: FocusArea[];
  roles: NamedItem[];
  focusAreaLabel: string;
  // Bulk selection
  selectionCount: number;
  selectedIds: Set<string>;
  activeTab: EmployeeTab;
  canManageEmployees: boolean;
  displayList: Employee[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onBulkInvite: (employees: Employee[]) => void;
  onBulkBench: (ids: string[]) => void;
  onBulkActivate: (ids: string[]) => void;
  onBulkTerminate: (ids: string[]) => void;
  onClearSelection: () => void;
  // Reorder
  isReordering: boolean;
  isDirty: boolean;
  onSaveOrder: () => void;
  onCancelReorder: () => void;
}

export function StaffContextBar({
  filterFocusArea,
  filterRole,
  hasActiveFilters,
  onClearFocusArea,
  onClearRole,
  onClearAll,
  focusAreas,
  roles,
  focusAreaLabel,
  selectionCount,
  selectedIds,
  activeTab,
  canManageEmployees,
  displayList,
  pendingInviteByEmployeeId,
  onBulkInvite,
  onBulkBench,
  onBulkActivate,
  onBulkTerminate,
  onClearSelection,
  isReordering,
  isDirty,
  onSaveOrder,
  onCancelReorder,
}: StaffContextBarProps) {
  const showFilters = hasActiveFilters && selectionCount === 0 && !isReordering;
  const showBulk = selectionCount > 0 && canManageEmployees && !isReordering;
  const showReorder = isReordering;
  const isVisible = showFilters || showBulk || showReorder;

  // Filter pill labels
  const focusAreaName = filterFocusArea ? focusAreas.find((fa) => fa.id === filterFocusArea)?.name : null;
  const roleName = filterRole ? roles.find((r) => r.id === filterRole)?.name : null;

  // Bulk action helpers
  const invitableEmployees =
    showBulk && activeTab === "active"
      ? displayList.filter(
          (e) => selectedIds.has(e.id) && e.email && !e.userId && !pendingInviteByEmployeeId.has(e.id),
        )
      : [];

  return (
    <div
      className={`overflow-hidden transition-all duration-150 ease-out ${
        isVisible ? "max-h-24 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-[var(--color-border-light)] bg-[var(--color-bg)]">
          {focusAreaName && <FilterPill label={`${focusAreaLabel}: ${focusAreaName}`} onClear={onClearFocusArea} />}
          {roleName && <FilterPill label={`Role: ${roleName}`} onClear={onClearRole} />}
          <button
            onClick={onClearAll}
            className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {showBulk && (
        <div className="flex items-center gap-4 px-5 py-3 rounded-xl border border-[var(--color-control-active-border)] bg-[var(--color-control-active-bg)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "var(--color-control-primary)" }}>
              <span className="text-[12px] font-bold text-white">{selectionCount}</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--color-control-active-text)]">{selectionCount} selected</span>
          </div>
          <div className="flex-1" />
          {invitableEmployees.length > 0 && (
            <button onClick={() => onBulkInvite(invitableEmployees)} className="dg-btn dg-btn-secondary dg-btn-sm">
              Invite ({invitableEmployees.length})
            </button>
          )}
          {activeTab === "active" && (
            <button onClick={() => onBulkBench([...selectedIds])} className="dg-btn dg-btn-secondary dg-btn-sm">
              Bench
            </button>
          )}
          {activeTab === "benched" && (
            <button onClick={() => onBulkActivate([...selectedIds])} className="dg-btn dg-btn-secondary dg-btn-sm">
              Activate
            </button>
          )}
          <button onClick={() => onBulkTerminate([...selectedIds])} className="dg-btn dg-btn-danger dg-btn-sm">
            Terminate
          </button>
          <button onClick={onClearSelection} className="dg-btn dg-btn-secondary dg-btn-sm">
            Cancel
          </button>
        </div>
      )}

      {/* Reorder bar */}
      {showReorder && (
        <div className="flex items-center gap-4 px-5 py-3 rounded-xl border border-[var(--color-control-active-border)] bg-[var(--color-control-active-bg)]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "var(--color-control-primary)" }}>
              <svg width="16" height="16" viewBox="0 0 14 14" fill="white">
                <rect x="3" y="1" width="2.5" height="2.5" rx="1.25" />
                <rect x="8.5" y="1" width="2.5" height="2.5" rx="1.25" />
                <rect x="3" y="5.75" width="2.5" height="2.5" rx="1.25" />
                <rect x="8.5" y="5.75" width="2.5" height="2.5" rx="1.25" />
                <rect x="3" y="10.5" width="2.5" height="2.5" rx="1.25" />
                <rect x="8.5" y="10.5" width="2.5" height="2.5" rx="1.25" />
              </svg>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-[var(--color-control-active-text)]">Reorder Mode</span>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Drag rows to change seniority order</p>
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={onCancelReorder}
            className="dg-btn dg-btn-secondary dg-btn-sm"
          >
            Cancel
          </button>
          {isDirty && (
            <button
              onClick={onSaveOrder}
              className="dg-btn dg-btn-primary dg-btn-sm"
            >
              Save Order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[var(--color-bg-secondary)] text-xs font-semibold text-[var(--color-text-secondary)]">
      {label}
      <button
        onClick={onClear}
        className="ml-0.5 p-0.5 rounded-sm text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)] transition-colors cursor-pointer"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}

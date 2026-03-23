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
        <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[var(--color-info-border)] bg-[var(--color-info-bg)]">
          <span className="text-[13px] font-bold text-[var(--color-info-text)]">{selectionCount} selected</span>
          <div className="flex-1" />
          {invitableEmployees.length > 0 && (
            <button
              onClick={() => onBulkInvite(invitableEmployees)}
              className="px-3 py-1 min-h-[32px] rounded-lg text-xs font-semibold text-[var(--color-link)] border border-[var(--color-info-border)] hover:bg-[var(--color-info-bg)] transition-colors"
            >
              Invite ({invitableEmployees.length})
            </button>
          )}
          {activeTab === "active" && (
            <button
              onClick={() => onBulkBench([...selectedIds])}
              className="px-3 py-1 min-h-[32px] rounded-lg text-xs font-semibold text-[var(--color-warning)] border border-[var(--color-warning-border)] hover:bg-[var(--color-warning-bg)] transition-colors"
            >
              Bench ({selectionCount})
            </button>
          )}
          {activeTab === "benched" && (
            <button
              onClick={() => onBulkActivate([...selectedIds])}
              className="px-3 py-1 min-h-[32px] rounded-lg text-xs font-semibold text-[var(--color-success)] border border-[var(--color-success-bg)] hover:bg-[var(--color-success-bg)] transition-colors"
            >
              Activate ({selectionCount})
            </button>
          )}
          <button
            onClick={() => onBulkTerminate([...selectedIds])}
            className="px-3 py-1 min-h-[32px] rounded-lg text-xs font-semibold text-[var(--color-danger)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg)] transition-colors"
          >
            Terminate ({selectionCount})
          </button>
          <button
            onClick={onClearSelection}
            className="px-3 py-1 min-h-[32px] rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Reorder bar */}
      {showReorder && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-info-border)] bg-[var(--color-info-bg)]">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--color-info)" style={{ flexShrink: 0 }}>
              <rect x="3" y="2" width="2" height="2" rx="1" />
              <rect x="9" y="2" width="2" height="2" rx="1" />
              <rect x="3" y="6" width="2" height="2" rx="1" />
              <rect x="9" y="6" width="2" height="2" rx="1" />
              <rect x="3" y="10" width="2" height="2" rx="1" />
              <rect x="9" y="10" width="2" height="2" rx="1" />
            </svg>
            <span className="text-[13px] font-semibold text-[var(--color-info-text)]">Drag rows to reorder</span>
          </div>
          <div className="flex-1" />
          {isDirty && (
            <button
              onClick={onSaveOrder}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          )}
          <button
            onClick={onCancelReorder}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] border border-[var(--color-border-light)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Cancel
          </button>
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

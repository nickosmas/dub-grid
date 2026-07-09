"use client";

import { Department, Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import type {
  AccountLinkFilter,
  ContactPresenceFilter,
  EmploymentTypeFilter,
} from "./useStaffFilters";

interface StaffContextBarProps {
  // Filter state
  filterEmploymentType: EmploymentTypeFilter;
  filterDepartment: number | null;
  filterDepartmentAdminOnly: boolean;
  filterFocusArea: number | null;
  filterCertification: number | null;
  filterRole: number | null;
  filterAccountLink: AccountLinkFilter;
  filterEmailPresence: ContactPresenceFilter;
  filterPhonePresence: ContactPresenceFilter;
  hasActiveFilters: boolean;
  onClearEmploymentType: () => void;
  onClearDepartment: () => void;
  onClearDepartmentAdminOnly: () => void;
  onClearFocusArea: () => void;
  onClearCertification: () => void;
  onClearRole: () => void;
  onClearAccountLink: () => void;
  onClearEmailPresence: () => void;
  onClearPhonePresence: () => void;
  onClearAll: () => void;
  // Metadata for labels
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  departments: Department[];
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  departmentLabel: string;
  // Bulk selection
  selectionCount: number;
  selectedIds: Set<string>;
  canManageEmployees: boolean;
  displayList: Employee[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onBulkInvite: (employees: Employee[]) => void;
  onBulkDeactivate: (ids: string[]) => void;
  onBulkActivate: (ids: string[]) => void;
  onBulkRemove: (ids: string[]) => void;
  onClearSelection: () => void;
  // Reorder
  isReordering: boolean;
  isDirty: boolean;
  onSaveOrder: () => void;
  onCancelReorder: () => void;
}

export function StaffContextBar({
  filterEmploymentType,
  filterDepartment,
  filterDepartmentAdminOnly,
  filterFocusArea,
  filterCertification,
  filterRole,
  filterAccountLink,
  filterEmailPresence,
  filterPhonePresence,
  hasActiveFilters,
  onClearEmploymentType,
  onClearDepartment,
  onClearDepartmentAdminOnly,
  onClearFocusArea,
  onClearCertification,
  onClearRole,
  onClearAccountLink,
  onClearEmailPresence,
  onClearPhonePresence,
  onClearAll,
  focusAreas,
  certifications,
  roles,
  departments,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  departmentLabel,
  selectionCount,
  selectedIds,
  canManageEmployees,
  displayList,
  pendingInviteByEmployeeId,
  onBulkInvite,
  onBulkDeactivate,
  onBulkActivate,
  onBulkRemove,
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
  const employmentTypeLabel =
    filterEmploymentType === "full_time"
      ? "Full-time"
      : filterEmploymentType === "part_time"
        ? "Part-time"
        : null;
  const departmentName = filterDepartment
    ? departments.find((department) => department.id === filterDepartment)?.name
    : null;
  const focusAreaName = filterFocusArea
    ? focusAreas.find((fa) => fa.id === filterFocusArea)?.name
    : null;
  const certificationName = filterCertification
    ? certifications.find((certification) => certification.id === filterCertification)?.name
    : null;
  const roleName = filterRole ? roles.find((r) => r.id === filterRole)?.name : null;
  const accountLinkLabel =
    filterAccountLink === "linked"
      ? "Linked account"
      : filterAccountLink === "unlinked"
        ? "Unlinked account"
        : null;
  const emailPresenceLabel =
    filterEmailPresence === "present"
      ? "Has email"
      : filterEmailPresence === "missing"
        ? "Missing email"
        : null;
  const phonePresenceLabel =
    filterPhonePresence === "present"
      ? "Has phone"
      : filterPhonePresence === "missing"
        ? "Missing phone"
        : null;

  // Bulk action helpers
  const selectedEmployees = showBulk ? displayList.filter((e) => selectedIds.has(e.id)) : [];
  const invitableEmployees = selectedEmployees.filter(
    (e) => e.status === "active" && e.email && !e.userId && !pendingInviteByEmployeeId.has(e.id),
  );
  const deactivatableIds = selectedEmployees.filter((e) => e.status === "active").map((e) => e.id);
  const activatableIds = selectedEmployees
    .filter((e) => e.status === "inactive" || e.status === "removed")
    .map((e) => e.id);
  const removableIds = selectedEmployees
    .filter((e) => e.status === "active" || e.status === "inactive")
    .map((e) => e.id);

  return (
    <div
      className={`overflow-hidden transition-all duration-150 ease-out ${
        isVisible ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
      }`}
    >
      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-[var(--color-border-light)] bg-[var(--color-bg)]">
          {employmentTypeLabel && (
            <FilterPill
              label={`Employment: ${employmentTypeLabel}`}
              onClear={onClearEmploymentType}
            />
          )}
          {departmentName && (
            <FilterPill
              label={`${departmentLabel}: ${departmentName}`}
              onClear={onClearDepartment}
            />
          )}
          {filterDepartmentAdminOnly && (
            <FilterPill
              label={departmentName ? `Department admin: ${departmentName}` : "Department admins"}
              onClear={onClearDepartmentAdminOnly}
            />
          )}
          {focusAreaName && (
            <FilterPill label={`${focusAreaLabel}: ${focusAreaName}`} onClear={onClearFocusArea} />
          )}
          {certificationName && (
            <FilterPill
              label={`${certificationLabel}: ${certificationName}`}
              onClear={onClearCertification}
            />
          )}
          {roleName && <FilterPill label={`${roleLabel}: ${roleName}`} onClear={onClearRole} />}
          {accountLinkLabel && (
            <FilterPill label={`Account: ${accountLinkLabel}`} onClear={onClearAccountLink} />
          )}
          {emailPresenceLabel && (
            <FilterPill label={`Email: ${emailPresenceLabel}`} onClear={onClearEmailPresence} />
          )}
          {phonePresenceLabel && (
            <FilterPill label={`Phone: ${phonePresenceLabel}`} onClear={onClearPhonePresence} />
          )}
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
        <div className="flex items-center gap-4 px-5 py-3 rounded-[var(--dg-radius-lg)] border border-[var(--color-control-active-border)] bg-[var(--color-control-active-bg)]">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-[var(--dg-radius-sm)]"
              style={{ background: "var(--color-control-primary)" }}
            >
              <span className="text-[12px] font-bold text-white">{selectionCount}</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--color-control-active-text)]">
              {selectionCount} selected
            </span>
          </div>
          <div className="flex-1" />
          {invitableEmployees.length > 0 && (
            <button
              onClick={() => onBulkInvite(invitableEmployees)}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              Invite ({invitableEmployees.length})
            </button>
          )}
          {activatableIds.length > 0 && (
            <button
              onClick={() => onBulkActivate(activatableIds)}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              Activate
              {activatableIds.length !== selectionCount ? ` (${activatableIds.length})` : ""}
            </button>
          )}
          {deactivatableIds.length > 0 && (
            <button
              onClick={() => onBulkDeactivate(deactivatableIds)}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              Deactivate
              {deactivatableIds.length !== selectionCount ? ` (${deactivatableIds.length})` : ""}
            </button>
          )}
          {removableIds.length > 0 && (
            <button
              onClick={() => onBulkRemove(removableIds)}
              className="dg-btn dg-btn-danger dg-btn-sm"
            >
              Remove{removableIds.length !== selectionCount ? ` (${removableIds.length})` : ""}
            </button>
          )}
          <button onClick={onClearSelection} className="dg-btn dg-btn-secondary dg-btn-sm">
            Cancel
          </button>
        </div>
      )}

      {/* Reorder bar */}
      {showReorder && (
        <div className="flex items-center gap-4 px-5 py-3 rounded-[var(--dg-radius-lg)] border border-[var(--color-control-active-border)] bg-[var(--color-control-active-bg)]">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-[var(--dg-radius-sm)]"
              style={{ background: "white" }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14">
                <rect x="3" y="1" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
                <rect x="8.5" y="1" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
                <rect x="3" y="5.75" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
                <rect x="8.5" y="5.75" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
                <rect x="3" y="10.5" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
                <rect x="8.5" y="10.5" width="2.5" height="2.5" rx="1.25" fill="var(--color-control-primary)" />
              </svg>
            </div>
            <div>
              <span className="text-[13px] font-semibold text-[var(--color-control-active-text)]">
                Reorder Mode
              </span>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Drag rows to change seniority order
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <button onClick={onCancelReorder} className="dg-btn dg-btn-secondary dg-btn-sm">
            {EDITOR_ACTION_LABELS.close}
          </button>
          {isDirty && (
            <button onClick={onSaveOrder} className="dg-btn dg-btn-primary dg-btn-sm">
              Save Order
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Applied-filter chip: matches <StatusPill>'s neutral tone + adds a close affordance.
function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)] whitespace-nowrap">
      {label}
      <button
        onClick={onClear}
        className="ml-0.5 p-0.5 rounded-sm text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)] transition-colors cursor-pointer"
        aria-label={`Clear ${label}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}

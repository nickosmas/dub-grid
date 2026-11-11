"use client";

import {
  BULK_STATUS_ACTIONS,
  ORG_ROLE_LABELS,
  describeStatusAction,
  isSelfAction,
  planBulkStatusChange,
  type BulkStatusAction,
  type BulkStatusPlan,
} from "@dubgrid/domain";
import { GripVertical } from "lucide-react";
import { Department, Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { Button } from "@/components/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import { useIsInSandbox } from "@/hooks";
import { STAFF_ACCOUNT_STATE_LABELS } from "./staff-account-state";
import type {
  AccountStateFilter,
  CertificationFilter,
  EmploymentTypeFilter,
  IdFilter,
  OrgRoleFilter,
  PhonePresenceFilter,
} from "./useStaffFilters";

interface StaffContextBarProps {
  // Filter state
  filterEmploymentType: EmploymentTypeFilter;
  filterDepartment: IdFilter;
  filterFocusArea: IdFilter;
  filterCertification: CertificationFilter;
  filterRole: IdFilter;
  filterAccount: AccountStateFilter;
  filterOrgRole: OrgRoleFilter;
  filterPhonePresence: PhonePresenceFilter;
  hasActiveFilters: boolean;
  onClearEmploymentType: () => void;
  onClearDepartment: () => void;
  onClearFocusArea: () => void;
  onClearCertification: () => void;
  onClearRole: () => void;
  onClearAccount: () => void;
  onClearOrgRole: () => void;
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
  canManageManagementAccess: boolean;
  displayList: Employee[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onBulkInvite: (employees: Employee[]) => void;
  /** Opens a bulk status change's confirmation (51h); absent, the bar offers none. */
  onBulkStatus?: (plan: BulkStatusPlan<Employee>) => void;
  /** The manager's own account, never changed by a bulk status change. */
  currentUserId?: string | null;
  /** False for someone this manager may not offboard or restore (51k); skipped with the reason. */
  canOffboard?: (employee: Employee) => boolean;
  onClearSelection: () => void;
  // Reorder
  isReordering: boolean;
  isDirty: boolean;
  onSaveOrder: () => Promise<void>;
  /** Puts the rows back in their saved order and stays in reorder mode. */
  onDiscardReorder: () => void;
  onCancelReorder: () => void;
}

const MODE_BAR_CLASS =
  "flex items-center flex-wrap gap-x-3 gap-y-2 px-4 py-2.5 rounded-[var(--dg-btn-radius)] border border-[var(--dg-color-control-active-border)] bg-[var(--dg-color-control-active-bg)]";
const MODE_BAR_TITLE_CLASS = "text-[13px] font-semibold text-[var(--dg-color-control-active-text)]";

export function StaffContextBar({
  filterEmploymentType,
  filterDepartment,
  filterFocusArea,
  filterCertification,
  filterRole,
  filterAccount,
  filterOrgRole,
  filterPhonePresence,
  hasActiveFilters,
  onClearEmploymentType,
  onClearDepartment,
  onClearFocusArea,
  onClearCertification,
  onClearRole,
  onClearAccount,
  onClearOrgRole,
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
  canManageManagementAccess,
  displayList,
  pendingInviteByEmployeeId,
  onBulkInvite,
  onBulkStatus,
  currentUserId = null,
  canOffboard,
  onClearSelection,
  isReordering,
  isDirty,
  onSaveOrder,
  onDiscardReorder,
  onCancelReorder,
}: StaffContextBarProps) {
  const isInSandbox = useIsInSandbox();
  const showFilters = hasActiveFilters && selectionCount === 0 && !isReordering;
  const showBulk = selectionCount > 0 && canManageEmployees && !isReordering;
  const showReorder = isReordering;
  const isVisible = showFilters || showBulk || showReorder;

  // Filter pill labels: one pill per filter, naming every choice ticked in it.
  const namesOf = (ids: readonly number[], items: readonly { id: number; name: string }[]) =>
    joinNames(ids.map((id) => items.find((item) => item.id === id)?.name));
  const employmentTypeLabel = joinNames(
    filterEmploymentType.map((type) => (type === "part_time" ? "Part-time" : "Full-time")),
  );
  const departmentName = namesOf(filterDepartment, departments);
  const focusAreaName = namesOf(filterFocusArea, focusAreas);
  const certificationName = joinNames(
    filterCertification.map((choice) =>
      choice === "any"
        ? "Certified staff"
        : choice === "none"
          ? "Not certified"
          : certifications.find((certification) => certification.id === choice)?.name,
    ),
  );
  const roleName = namesOf(filterRole, roles);
  const accountLabel = joinNames(filterAccount.map((state) => STAFF_ACCOUNT_STATE_LABELS[state]));
  const orgRoleLabel = joinNames(filterOrgRole.map((role) => ORG_ROLE_LABELS[role]));
  const phonePresenceLabel = joinNames(
    filterPhonePresence.map((presence) => (presence === "present" ? "Has phone" : "Missing phone")),
  );
  const activeFilterCount = [
    employmentTypeLabel,
    departmentName,
    focusAreaName,
    certificationName,
    roleName,
    accountLabel,
    orgRoleLabel,
    phonePresenceLabel,
  ].filter(Boolean).length;

  // Bulk action helpers
  const selectedEmployees = showBulk ? displayList.filter((e) => selectedIds.has(e.id)) : [];
  const invitableEmployees = selectedEmployees.filter(
    (e) => e.status === "active" && e.email && !e.userId && !pendingInviteByEmployeeId.has(e.id),
  );
  // Each change shows only when it reaches someone, with how many (51h).
  const statusPlans: BulkStatusPlan<Employee>[] = onBulkStatus
    ? BULK_STATUS_ACTIONS.map((action: BulkStatusAction) =>
        planBulkStatusChange(
          action,
          selectedEmployees,
          (employee) => isSelfAction(currentUserId, employee.userId),
          canOffboard,
        ),
      ).filter((plan) => plan.eligible.length > 0)
    : [];
  // One red per bar: Offboard when it's offered, otherwise Suspend.
  const strongestStatusAction = (["archive", "suspend"] as const).find((action) =>
    statusPlans.some((plan) => plan.action === action),
  );

  return (
    <div
      className={`overflow-hidden transition-all duration-150 ease-out ${
        isVisible ? "max-h-40 opacity-100" : "max-h-0 opacity-0 !mb-0"
      }`}
    >
      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg)]">
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
          {accountLabel && (
            <FilterPill label={`Account: ${accountLabel}`} onClear={onClearAccount} />
          )}
          {orgRoleLabel && (
            <FilterPill label={`Access role: ${orgRoleLabel}`} onClear={onClearOrgRole} />
          )}
          {phonePresenceLabel && (
            <FilterPill label={`Phone: ${phonePresenceLabel}`} onClear={onClearPhonePresence} />
          )}
          <ClearFiltersButton activeFilterCount={activeFilterCount} onClear={onClearAll} small />
        </div>
      )}

      {/* Bulk action bar */}
      {showBulk && (
        <div className={MODE_BAR_CLASS}>
          <span className={`${MODE_BAR_TITLE_CLASS} dg-tabular-nums`}>
            {selectionCount} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {invitableEmployees.length > 0 && canManageManagementAccess && (
              <Button
                onClick={() => onBulkInvite(invitableEmployees)}
                disabled={isInSandbox}
                className="dg-btn dg-btn-secondary dg-btn-sm"
                title={
                  isInSandbox ? "Sending invitations isn't available in sandbox mode." : undefined
                }
              >
                Invite ({invitableEmployees.length})
              </Button>
            )}
            {statusPlans.map((plan) => (
              <Button
                key={plan.action}
                onClick={() => onBulkStatus?.(plan)}
                className={`dg-btn dg-btn-sm dg-tabular-nums ${
                  plan.action === strongestStatusAction ? "dg-btn-danger" : "dg-btn-secondary"
                }`}
              >
                {describeStatusAction(plan.action, "").label} ({plan.eligible.length})
              </Button>
            ))}
            <Button onClick={onClearSelection} className="dg-btn dg-btn-secondary dg-btn-sm">
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {/* Reorder bar */}
      {showReorder && (
        <div className={MODE_BAR_CLASS}>
          <GripVertical
            size={16}
            aria-hidden
            className="shrink-0 text-[var(--dg-color-text-muted)]"
          />
          <div className="min-w-0">
            <p className={MODE_BAR_TITLE_CLASS}>Reorder by seniority</p>
            <p className="mt-0.5 text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-muted)]">
              Drag rows into order, then save.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={isDirty ? onDiscardReorder : onCancelReorder}
              className="dg-btn dg-btn-secondary dg-btn-sm"
            >
              {getEditorDismissLabel({ hasUnsavedChanges: isDirty })}
            </Button>
            <Button
              onClick={onSaveOrder}
              disabled={!isDirty}
              className="dg-btn dg-btn-primary dg-btn-sm"
            >
              Save order
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The names a filter has ticked, or null when it has none (or none still exist). */
function joinNames(names: readonly (string | undefined)[]): string | null {
  const known = names.filter((name): name is string => Boolean(name));
  return known.length > 0 ? known.join(", ") : null;
}

// Applied-filter chip: matches <StatusPill>'s neutral tone + adds a close affordance.
function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--dg-color-border-light)] bg-[var(--dg-color-bg-secondary)] px-2 py-0.5 text-[length:var(--dg-type-badge-size)] font-medium text-[var(--dg-color-text-secondary)]">
      {label}
      <CloseButton size="xs" onClick={onClear} aria-label={`Clear ${label}`} className="ml-0.5" />
    </span>
  );
}

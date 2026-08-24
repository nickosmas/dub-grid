"use client";

import { ORG_ROLE_LABELS } from "@dubgrid/domain";
import { FilterChip, FilterPanelShell, FilterSection } from "./FilterPanelShell";
import { MANAGEMENT_ROLE_FILTERS } from "./useManagementFilters";
import type {
  ManagementInvitationFilter,
  ManagementRoleFilter,
  ManagementSortKey,
} from "./useManagementFilters";

/**
 * The management roster's filters. Deliberately not the staff panel: focus
 * areas, certifications and employment types describe scheduled staff, and a
 * roster row answers none of them. Management departments stay on the tab
 * strip beside the search box, which is where this view already filters them.
 */
export function ManagementFilterPopover({
  open,
  onClose,
  anchorRef,
  filterRole,
  onFilterRoleChange,
  filterInvitation,
  onFilterInvitationChange,
  sortKey,
  onSortKeyChange,
  pendingCount,
  onClearAll,
  hasActiveFilters,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  filterRole: ManagementRoleFilter;
  onFilterRoleChange: (value: ManagementRoleFilter) => void;
  filterInvitation: ManagementInvitationFilter;
  onFilterInvitationChange: (value: ManagementInvitationFilter) => void;
  sortKey: ManagementSortKey;
  onSortKeyChange: (value: ManagementSortKey) => void;
  pendingCount: number;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}) {
  return (
    <FilterPanelShell
      anchorRef={anchorRef}
      hasActiveFilters={hasActiveFilters}
      open={open}
      title="Management filters"
      widthClassName="w-[420px]"
      onClearAll={onClearAll}
      onClose={onClose}
    >
      <FilterSection title="Access level">
        <FilterChip active={filterRole === "all"} onClick={() => onFilterRoleChange("all")}>
          All
        </FilterChip>
        {MANAGEMENT_ROLE_FILTERS.map((role) => (
          <FilterChip
            key={role}
            active={filterRole === role}
            onClick={() => onFilterRoleChange(role)}
          >
            {ORG_ROLE_LABELS[role]}
          </FilterChip>
        ))}
      </FilterSection>

      <FilterSection title="Invitation">
        <FilterChip
          active={filterInvitation === "all"}
          onClick={() => onFilterInvitationChange("all")}
        >
          All
        </FilterChip>
        <FilterChip
          active={filterInvitation === "has_access"}
          onClick={() => onFilterInvitationChange("has_access")}
        >
          Has access
        </FilterChip>
        <FilterChip
          active={filterInvitation === "pending"}
          onClick={() => onFilterInvitationChange("pending")}
        >
          Invitation pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </FilterChip>
      </FilterSection>

      <FilterSection title="Sort by">
        <FilterChip active={sortKey === "name"} onClick={() => onSortKeyChange("name")}>
          Alphabetical
        </FilterChip>
        <FilterChip active={sortKey === "access"} onClick={() => onSortKeyChange("access")}>
          Access level
        </FilterChip>
      </FilterSection>
    </FilterPanelShell>
  );
}

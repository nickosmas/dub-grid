"use client";

import { ORG_ROLE_LABELS } from "@dubgrid/domain";
import { SpanTabs, type SpanTabItem } from "@/components/ui/span-tabs";
import { FilterField, FilterPanelShell } from "./FilterPanelShell";
import { MANAGEMENT_ROLE_FILTERS } from "./useManagementFilters";
import type { ManagementInvitationFilter, ManagementRoleFilter } from "./useManagementFilters";

const ACCESS_ROLE_ITEMS: SpanTabItem<ManagementRoleFilter>[] = [
  { value: "all", label: "All" },
  ...MANAGEMENT_ROLE_FILTERS.map((role) => ({ value: role, label: ORG_ROLE_LABELS[role] })),
];

/**
 * The management roster's filters. Deliberately not the staff panel: focus
 * areas, certifications and employment types describe scheduled staff, and a
 * roster row answers none of them. Administrative Teams stay on the toolbar's
 * segmented control, and sorting is the toolbar's dropdown.
 */
export function ManagementFilterPopover({
  open,
  onClose,
  anchorRef,
  filterRole,
  onFilterRoleChange,
  filterInvitation,
  onFilterInvitationChange,
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
  pendingCount: number;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}) {
  const invitationItems: SpanTabItem<ManagementInvitationFilter>[] = [
    { value: "all", label: "All" },
    { value: "has_access", label: "Has access" },
    {
      value: "pending",
      label: "Invitation pending",
      count: pendingCount,
      countLabel: `${pendingCount} pending`,
    },
  ];

  return (
    <FilterPanelShell
      anchorRef={anchorRef}
      hasActiveFilters={hasActiveFilters}
      open={open}
      onClearAll={onClearAll}
      onClose={onClose}
    >
      <FilterField label="Access role">
        <SpanTabs
          aria-label="Access role"
          items={ACCESS_ROLE_ITEMS}
          value={filterRole}
          onChange={onFilterRoleChange}
        />
      </FilterField>
      <FilterField label="Invitation">
        <SpanTabs
          aria-label="Invitation"
          items={invitationItems}
          value={filterInvitation}
          onChange={onFilterInvitationChange}
        />
      </FilterField>
    </FilterPanelShell>
  );
}

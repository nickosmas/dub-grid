"use client";

import { ORG_ROLE_LABELS } from "@dubgrid/domain";
import { CapsuleChoices, type CapsuleChoice } from "@/components/ui/capsule-choices";
import { FilterField, FilterPanelShell } from "./FilterPanelShell";
import { MANAGEMENT_ROLE_FILTERS } from "./useManagementFilters";
import type { ManagementInvitationFilter, ManagementRoleFilter } from "./useManagementFilters";

const ACCESS_ROLE_ITEMS: CapsuleChoice<ManagementRoleFilter>[] = [
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
  const invitationItems: CapsuleChoice<ManagementInvitationFilter>[] = [
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
        <CapsuleChoices
          aria-label="Access role"
          items={ACCESS_ROLE_ITEMS}
          value={filterRole}
          onChange={onFilterRoleChange}
        />
      </FilterField>
      <FilterField label="Invitation">
        <CapsuleChoices
          aria-label="Invitation"
          items={invitationItems}
          value={filterInvitation}
          onChange={onFilterInvitationChange}
        />
      </FilterField>
    </FilterPanelShell>
  );
}

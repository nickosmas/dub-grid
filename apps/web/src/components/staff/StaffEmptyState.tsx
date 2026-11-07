"use client";

import { EmptyState } from "@/components/EmptyState";
import { ClearFiltersButton } from "@/components/ClearFiltersButton";
import type { EmployeeTab } from "./useStaffFilters";

interface StaffEmptyStateProps {
  activeTab: EmployeeTab;
  /** A search or a filter narrowed the list. */
  hasFilters: boolean;
  /** Filters alone: a search clears from its own box. */
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function StaffEmptyState({
  activeTab,
  hasFilters,
  activeFilterCount,
  onClearFilters,
}: StaffEmptyStateProps) {
  const title = hasFilters
    ? activeFilterCount === 0
      ? "No one matches your search"
      : activeFilterCount === 1
        ? "No one matches this filter"
        : "No one matches these filters"
    : activeTab === "active"
      ? "No active staff"
      : activeTab === "inactive"
        ? "No one is away"
        : "No one is offboarded";

  const description = hasFilters
    ? undefined
    : activeTab === "active"
      ? "Add your first staff member."
      : activeTab === "inactive"
        ? "People you mark away will appear here."
        : "People you offboard will appear here.";

  return (
    <EmptyState
      size="compact"
      title={title}
      description={description}
      action={
        activeFilterCount > 0 ? (
          <ClearFiltersButton activeFilterCount={activeFilterCount} onClear={onClearFilters} />
        ) : undefined
      }
    />
  );
}

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
    ? "No results found"
    : activeTab === "active"
      ? "No active staff"
      : activeTab === "inactive"
        ? "No one is away"
        : "No one is offboarded";

  const description = hasFilters
    ? "Try adjusting your search or filters."
    : activeTab === "active"
      ? "Add your first staff member."
      : activeTab === "inactive"
        ? "People you mark away will appear here."
        : "People you offboard will appear here.";

  return (
    <EmptyState
      icon={
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      }
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

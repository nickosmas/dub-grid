"use client";

import { EmptyState } from "@/components/EmptyState";
import type { EmployeeTab } from "./useStaffFilters";

interface StaffEmptyStateProps {
  activeTab: EmployeeTab;
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function StaffEmptyState({ activeTab, hasFilters, onClearFilters }: StaffEmptyStateProps) {
  const title = hasFilters
    ? "No results found"
    : activeTab === "active"
      ? "No active employees"
      : activeTab === "inactive"
        ? "No inactive employees"
        : "No removed employees";

  const description = hasFilters
    ? "Try adjusting your search or filters."
    : activeTab === "active"
      ? "Get started by adding your first staff member."
      : activeTab === "inactive"
        ? "Employees you mark inactive will appear here."
        : "Removed employees will appear here.";

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
        hasFilters ? (
          <button
            onClick={onClearFilters}
            className="dg-btn dg-btn-secondary"
            style={{ marginTop: 8 }}
          >
            Clear filters
          </button>
        ) : undefined
      }
    />
  );
}

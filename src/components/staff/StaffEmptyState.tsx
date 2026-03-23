"use client";

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
      : activeTab === "benched"
        ? "No benched employees"
        : "No terminated employees";

  const description = hasFilters
    ? "Try adjusting your search or filters."
    : activeTab === "active"
      ? "Get started by adding your first staff member."
      : activeTab === "benched"
        ? "Employees you bench will appear here."
        : "Terminated employees will appear here.";

  return (
    <div
      style={{
        padding: "64px 24px",
        textAlign: "center",
        background: "var(--color-surface)",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        color: "var(--color-text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          color: "var(--color-text-faint)",
          background: "var(--color-bg)",
          padding: 20,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-raised)",
        }}
      >
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
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {title}
        </div>
        <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)" }}>{description}</p>
      </div>
      {hasFilters && (
        <button onClick={onClearFilters} className="dg-btn dg-btn-secondary" style={{ marginTop: 8 }}>
          Clear filters
        </button>
      )}
    </div>
  );
}

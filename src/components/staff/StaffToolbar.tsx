"use client";

import { useState, useRef, useEffect } from "react";
import type { EmployeeTab, SortBy } from "./useStaffFilters";
import { useMediaQuery, MOBILE, TABLET } from "@/hooks";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

interface TabItem {
  key: EmployeeTab;
  label: string;
  count: number;
}

interface StaffToolbarProps {
  tabs: TabItem[];
  activeTab: EmployeeTab;
  onTabChange: (tab: EmployeeTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  // Sort
  sortBy: SortBy;
  onSortChange: (s: SortBy) => void;
  // Reorder
  canReorder: boolean;
  onEnterReorder: () => void;
  // Filter
  hasActiveFilters: boolean;
  hasUnlinked: boolean;
  isReordering: boolean;
  canManageEmployees: boolean;
  showAdd: boolean;
  onAdd: () => void;
  onFilterToggle: () => void;
  filterOpen: boolean;
  filterBtnRef?: React.RefObject<HTMLButtonElement | null>;
}

const SORT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M6 12h12M9 18h6" />
  </svg>
);

const CHECK_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function StaffToolbar({
  tabs,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  canReorder,
  onEnterReorder,
  hasActiveFilters,
  hasUnlinked,
  isReordering,
  canManageEmployees,
  showAdd,
  onAdd,
  onFilterToggle,
  filterOpen,
  filterBtnRef,
}: StaffToolbarProps) {
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sortOpen, setSortOpen] = useState(false);

  // Keyboard shortcut: "/" focuses search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sortOptions: { value: SortBy; label: string }[] = [
    { value: "seniority", label: "Seniority" },
    { value: "name", label: "Name" },
  ];

  const currentSortLabel = sortOptions.find((o) => o.value === sortBy)?.label ?? "Seniority";

  const sortDropdown = (
    <PopoverPrimitive.Root open={sortOpen} onOpenChange={setSortOpen}>
      <PopoverPrimitive.Trigger
        render={<button />}
        aria-label={`Sort by ${currentSortLabel}`}
        className={`relative flex items-center gap-1.5 shrink-0 rounded-[10px] text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
          isMobile ? "h-11 px-2.5" : "h-[var(--dg-toolbar-h)] px-2.5"
        } ${
          sortOpen
            ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)]"
        }`}
      >
        {SORT_ICON}
        {!isMobile && <span>{currentSortLabel}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className="min-w-[160px] rounded-[10px] border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-float)] outline-hidden"
          >
            <div className="px-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                className={`flex items-center gap-2 w-full px-2 py-2.5 rounded-[8px] text-xs font-medium transition-colors ${
                  sortBy === opt.value
                    ? "text-[var(--color-text-primary)] bg-[var(--color-border-light)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                <span className="w-3 shrink-0">
                  {sortBy === opt.value && CHECK_ICON}
                </span>
                {opt.label}
              </button>
            ))}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );

  const tabButtons = (
    <div className="dg-span-tabs dg-span-tabs--light" style={{ flex: "0 1 auto" }}>
      {tabs.map((tab, i) => {
        const active = activeTab === tab.key;
        const prevActive = i > 0 && activeTab === tabs[i - 1].key;
        const showDivider = i > 0 && !active && !prevActive;
        return (
          <span key={tab.key} style={{ display: "contents" }}>
            {i > 0 && (
              <div style={{ width: 1, height: 16, background: showDivider ? "var(--color-border)" : "transparent", flexShrink: 0, alignSelf: "center" }} />
            )}
            <button
              onClick={() => onTabChange(tab.key)}
              className={`dg-span-tab${active ? " active" : ""}`}
            >
              {tab.label}
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                minWidth: 18, height: 18, borderRadius: "50%", padding: "0 4px",
                fontSize: "var(--dg-fs-micro)", fontWeight: 700, lineHeight: 1,
                background: active ? "rgba(255,255,255,0.25)" : "var(--color-border-light)",
                color: active ? "inherit" : "var(--color-text-muted)",
                marginLeft: 3,
              }}>{tab.count}</span>
            </button>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="bg-[var(--color-bg)]">
      {isMobile ? (
        <div className="flex flex-col border-b border-[var(--color-border)]">
          {/* Tab row */}
          <div className="px-3 py-2">
            {tabButtons}
          </div>

          {/* Controls row — invisible during reorder to preserve height */}
            <div className={`flex items-center gap-2 px-3 py-2${isReordering ? " invisible pointer-events-none" : ""}`}>
              {/* Search - full width on mobile */}
              <div className="relative flex-1">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search staff..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-8 text-[14px] font-medium text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-border-focus)] focus:ring-[3px] focus:ring-[rgba(56,189,248,0.15)] outline-none transition-all duration-150"
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Sort dropdown */}
              {sortDropdown}

              {/* Filter button */}
              <button
                ref={filterBtnRef}
                onClick={onFilterToggle}
                className={`relative flex items-center justify-center h-11 w-11 shrink-0 rounded-[10px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
                  filterOpen
                    ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {(hasActiveFilters || hasUnlinked) && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-warning)] ring-2 ring-[var(--color-bg)]" />
                )}
              </button>

              {/* Reorder button */}
              {canManageEmployees && (
                <button
                  onClick={onEnterReorder}
                  disabled={!canReorder}
                  aria-label="Reorder Seniority"
                  className={`flex items-center justify-center h-11 w-11 shrink-0 rounded-[10px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
                    canReorder
                      ? "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                      : "text-[var(--color-text-faint)] opacity-35 cursor-not-allowed"
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="7 15 12 20 17 15" />
                    <polyline points="7 9 12 4 17 9" />
                  </svg>
                </button>
              )}

              {/* Add button (icon only on mobile) */}
              {showAdd && canManageEmployees && (
                <button
                  onClick={onAdd}
                  className="flex items-center justify-center h-11 w-11 shrink-0 rounded-[10px] bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>
        </div>
      ) : (
        /* Desktop & Tablet: single row */
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-4">
          {/* Tabs */}
          {tabButtons}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right zone: search + sort + filter + add — invisible during reorder to preserve height */}
            <div className={`flex items-center gap-2 py-2${isReordering ? " invisible pointer-events-none" : ""}`}>
              {/* Search */}
              <div className="relative">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search staff..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className={`h-[var(--dg-toolbar-h)] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-8 text-[13px] font-medium text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-border-focus)] focus:ring-[3px] focus:ring-[rgba(56,189,248,0.15)] outline-none transition-all duration-150 ${
                    isTablet ? "w-[180px] focus:w-[240px]" : "w-[200px]"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Sort dropdown */}
              {sortDropdown}

              {/* Filter button */}
              <button
                ref={filterBtnRef}
                onClick={onFilterToggle}
                className={`relative flex items-center gap-1.5 h-[var(--dg-toolbar-h)] px-2.5 rounded-[10px] text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
                  filterOpen
                    ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {!isTablet && <span>Filter</span>}
                {(hasActiveFilters || hasUnlinked) && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[var(--color-warning)] ring-2 ring-[var(--color-bg)]" />
                )}
              </button>

              {/* Reorder button */}
              {canManageEmployees && (
                <button
                  onClick={onEnterReorder}
                  disabled={!canReorder}
                  aria-label="Reorder Seniority"
                  className={`flex items-center gap-1.5 h-[var(--dg-toolbar-h)] px-2.5 rounded-[10px] text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 ${
                    canReorder
                      ? "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                      : "text-[var(--color-text-faint)] opacity-35 cursor-not-allowed"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="7 15 12 20 17 15" />
                    <polyline points="7 9 12 4 17 9" />
                  </svg>
                  {!isTablet && <span>Reorder</span>}
                </button>
              )}

              {/* Add button */}
              {showAdd && canManageEmployees && (
                <button
                  onClick={onAdd}
                  className="flex items-center gap-1.5 h-[var(--dg-toolbar-h)] px-3 rounded-[10px] bg-[var(--color-brand)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {isTablet ? "" : "Add"}
                </button>
              )}
            </div>
        </div>
      )}
    </div>
  );
}

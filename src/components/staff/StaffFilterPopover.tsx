"use client";

import { FocusArea, NamedItem } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface StaffFilterPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  // Filters
  filterFocusArea: number | null;
  onFilterFocusAreaChange: (id: number | null) => void;
  filterRole: number | null;
  onFilterRoleChange: (id: number | null) => void;
  // Data
  focusAreas: FocusArea[];
  roles: NamedItem[];
  focusAreaLabel: string;
  roleLabel: string;
  // Unlinked
  unlinkedCount: number;
  showOnlyUnlinked: boolean;
  onShowOnlyUnlinkedChange: (v: boolean) => void;
  // Clear
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export function StaffFilterPopover({
  open,
  onClose,
  anchorRef,
  filterFocusArea,
  onFilterFocusAreaChange,
  filterRole,
  onFilterRoleChange,
  focusAreas,
  roles,
  focusAreaLabel,
  roleLabel,
  unlinkedCount,
  showOnlyUnlinked,
  onShowOnlyUnlinkedChange,
  onClearAll,
  hasActiveFilters,
}: StaffFilterPopoverProps) {
  const isMobile = useMediaQuery(MOBILE);

  const content = (
    <div className="flex flex-col">
      <div className="overflow-y-auto flex-1 px-4 py-3">
        {/* Focus Area filter */}
        {focusAreas.length > 0 && (
          <>
            <div className="mb-4">
              <div className="text-[11px] font-bold text-[var(--color-text-subtle)] uppercase tracking-wider mb-2">
                {focusAreaLabel}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onFilterFocusAreaChange(null)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 border-[1.5px] border-transparent ${
                    filterFocusArea === null
                      ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)]"
                      : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)] hover:bg-[var(--color-border-light)]"
                  }`}
                >
                  All
                </button>
                {focusAreas.map((fa) => {
                  const active = filterFocusArea === fa.id;
                  return (
                    <button
                      key={fa.id}
                      onClick={() => onFilterFocusAreaChange(fa.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 border-[1.5px] border-transparent ${
                        active
                          ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)]"
                          : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)] hover:bg-[var(--color-border-light)]"
                      }`}
                    >
                      <span
                        className="w-[7px] h-[7px] rounded-full shrink-0"
                        style={{
                          background: fa.colorBg,
                          border: active ? "1px solid rgba(255,255,255,0.3)" : "none",
                        }}
                      />
                      {fa.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-[var(--color-border-light)] my-3" />
          </>
        )}

        {/* Role filter */}
        {roles.length > 0 && (
          <>
            <div className="mb-4">
              <div className="text-[11px] font-bold text-[var(--color-text-subtle)] uppercase tracking-wider mb-2">
                {roleLabel}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => onFilterRoleChange(null)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 border-[1.5px] border-transparent ${
                    filterRole === null
                      ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)]"
                      : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)] hover:bg-[var(--color-border-light)]"
                  }`}
                >
                  All
                </button>
                {roles.map((r) => {
                  const active = filterRole === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onFilterRoleChange(r.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 border-[1.5px] border-transparent ${
                        active
                          ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)]"
                          : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)] hover:bg-[var(--color-border-light)]"
                      }`}
                    >
                      {r.abbr}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-[var(--color-border-light)] my-3" />
          </>
        )}

        {/* Unlinked toggle */}
        {unlinkedCount > 0 && (
          <>
            <label className="flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer hover:bg-[var(--color-bg-secondary)] transition-colors">
              <input
                type="checkbox"
                checked={showOnlyUnlinked}
                onChange={(e) => onShowOnlyUnlinkedChange(e.target.checked)}
                className="accent-[var(--color-warning)] w-3.5 h-3.5"
              />
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Show only unlinked accounts
              </span>
              <span className="ml-auto text-xs font-semibold text-[var(--color-warning)]">{unlinkedCount}</span>
            </label>

            <div className="h-px bg-[var(--color-border-light)] my-3" />
          </>
        )}

      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border-light)]">
        <button
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          className={`text-xs font-semibold transition-colors ${
            hasActiveFilters
              ? "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              : "text-[var(--color-text-faint)] cursor-not-allowed"
          }`}
        >
          Clear All
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-brand)] text-white hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl gap-0 p-0 max-h-[75vh]">
          <SheetHeader className="sr-only">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-[var(--color-border)]" />
          </div>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop/Tablet: popover anchored to filter button
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side="bottom"
          align="end"
          sideOffset={4}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className="w-96 max-h-[600px] flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-float)] outline-hidden"
          >
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

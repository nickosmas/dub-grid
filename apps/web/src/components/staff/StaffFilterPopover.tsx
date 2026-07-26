"use client";

import type { ReactNode } from "react";
import type { Department, FocusArea, NamedItem } from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type {
  AccountLinkFilter,
  ContactPresenceFilter,
  EmploymentTypeFilter,
} from "./useStaffFilters";

interface StaffFilterPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  filterEmploymentType: EmploymentTypeFilter;
  onFilterEmploymentTypeChange: (value: EmploymentTypeFilter) => void;
  filterDepartment: number | null;
  onFilterDepartmentChange: (id: number | null) => void;
  filterDepartmentAdminOnly: boolean;
  onFilterDepartmentAdminOnlyChange: (value: boolean) => void;
  filterFocusArea: number | null;
  onFilterFocusAreaChange: (id: number | null) => void;
  filterCertification: number | null;
  onFilterCertificationChange: (id: number | null) => void;
  filterRole: number | null;
  onFilterRoleChange: (id: number | null) => void;
  filterAccountLink: AccountLinkFilter;
  onFilterAccountLinkChange: (value: AccountLinkFilter) => void;
  filterEmailPresence: ContactPresenceFilter;
  onFilterEmailPresenceChange: (value: ContactPresenceFilter) => void;
  filterPhonePresence: ContactPresenceFilter;
  onFilterPhonePresenceChange: (value: ContactPresenceFilter) => void;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  departments: Department[];
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  departmentLabel: string;
  unlinkedCount: number;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export function StaffFilterPopover({
  open,
  onClose,
  anchorRef,
  filterEmploymentType,
  onFilterEmploymentTypeChange,
  filterDepartment,
  onFilterDepartmentChange,
  filterDepartmentAdminOnly,
  onFilterDepartmentAdminOnlyChange,
  filterFocusArea,
  onFilterFocusAreaChange,
  filterCertification,
  onFilterCertificationChange,
  filterRole,
  onFilterRoleChange,
  filterAccountLink,
  onFilterAccountLinkChange,
  filterEmailPresence,
  onFilterEmailPresenceChange,
  filterPhonePresence,
  onFilterPhonePresenceChange,
  focusAreas,
  certifications,
  roles,
  departments,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  departmentLabel,
  unlinkedCount,
  onClearAll,
  hasActiveFilters,
}: StaffFilterPopoverProps) {
  const isMobile = useMediaQuery(MOBILE);

  const content = (
    <div className="flex max-h-[inherit] flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <FilterSection title="Employment">
          <FilterChip
            active={filterEmploymentType === "all"}
            onClick={() => onFilterEmploymentTypeChange("all")}
          >
            All
          </FilterChip>
          <FilterChip
            active={filterEmploymentType === "full_time"}
            onClick={() => onFilterEmploymentTypeChange("full_time")}
          >
            Full-time
          </FilterChip>
          <FilterChip
            active={filterEmploymentType === "part_time"}
            onClick={() => onFilterEmploymentTypeChange("part_time")}
          >
            Part-time
          </FilterChip>
        </FilterSection>

        {departments.length > 0 && (
          <FilterSection title={departmentLabel}>
            <FilterChip
              active={filterDepartment === null}
              onClick={() => onFilterDepartmentChange(null)}
            >
              All
            </FilterChip>
            {departments.map((department) => (
              <FilterChip
                key={department.id}
                active={filterDepartment === department.id}
                onClick={() => onFilterDepartmentChange(department.id)}
              >
                {department.name}
              </FilterChip>
            ))}
            <label className="mt-2 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--dg-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--color-bg-secondary)]">
              <input
                type="checkbox"
                checked={filterDepartmentAdminOnly}
                onChange={(event) => onFilterDepartmentAdminOnlyChange(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-brand)]"
              />
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Department admins only
              </span>
            </label>
          </FilterSection>
        )}

        <FilterSection title="Qualifications">
          {focusAreas.length > 0 && (
            <FilterGroup label={focusAreaLabel}>
              <FilterChip
                active={filterFocusArea === null}
                onClick={() => onFilterFocusAreaChange(null)}
              >
                All
              </FilterChip>
              {focusAreas.map((focusArea) => (
                <FilterChip
                  key={focusArea.id}
                  active={filterFocusArea === focusArea.id}
                  onClick={() => onFilterFocusAreaChange(focusArea.id)}
                >
                  {focusArea.name}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          {certifications.length > 0 && (
            <FilterGroup label={certificationLabel}>
              <FilterChip
                active={filterCertification === null}
                onClick={() => onFilterCertificationChange(null)}
              >
                All
              </FilterChip>
              {certifications.map((certification) => (
                <FilterChip
                  key={certification.id}
                  active={filterCertification === certification.id}
                  onClick={() => onFilterCertificationChange(certification.id)}
                >
                  {certification.abbr}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          {roles.length > 0 && (
            <FilterGroup label={roleLabel}>
              <FilterChip active={filterRole === null} onClick={() => onFilterRoleChange(null)}>
                All
              </FilterChip>
              {roles.map((role) => (
                <FilterChip
                  key={role.id}
                  active={filterRole === role.id}
                  onClick={() => onFilterRoleChange(role.id)}
                >
                  {role.abbr}
                </FilterChip>
              ))}
            </FilterGroup>
          )}
        </FilterSection>

        <FilterSection title="Account">
          <FilterChip
            active={filterAccountLink === "all"}
            onClick={() => onFilterAccountLinkChange("all")}
          >
            All
          </FilterChip>
          <FilterChip
            active={filterAccountLink === "linked"}
            onClick={() => onFilterAccountLinkChange("linked")}
          >
            Linked account
          </FilterChip>
          <FilterChip
            active={filterAccountLink === "unlinked"}
            onClick={() => onFilterAccountLinkChange("unlinked")}
          >
            Unlinked account{unlinkedCount > 0 ? ` (${unlinkedCount})` : ""}
          </FilterChip>
        </FilterSection>

        <FilterSection title="Contact">
          <FilterGroup label="Email">
            <FilterChip
              active={filterEmailPresence === "all"}
              onClick={() => onFilterEmailPresenceChange("all")}
            >
              All
            </FilterChip>
            <FilterChip
              active={filterEmailPresence === "present"}
              onClick={() => onFilterEmailPresenceChange("present")}
            >
              Has email
            </FilterChip>
            <FilterChip
              active={filterEmailPresence === "missing"}
              onClick={() => onFilterEmailPresenceChange("missing")}
            >
              Missing email
            </FilterChip>
          </FilterGroup>

          <FilterGroup label="Phone">
            <FilterChip
              active={filterPhonePresence === "all"}
              onClick={() => onFilterPhonePresenceChange("all")}
            >
              All
            </FilterChip>
            <FilterChip
              active={filterPhonePresence === "present"}
              onClick={() => onFilterPhonePresenceChange("present")}
            >
              Has phone
            </FilterChip>
            <FilterChip
              active={filterPhonePresence === "missing"}
              onClick={() => onFilterPhonePresenceChange("missing")}
            >
              Missing phone
            </FilterChip>
          </FilterGroup>
        </FilterSection>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border-light)] px-4 py-3">
        <button
          type="button"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          className={`text-xs font-semibold transition-colors ${
            hasActiveFilters
              ? "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              : "cursor-not-allowed text-[var(--color-text-faint)]"
          }`}
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--dg-radius-sm)] bg-[var(--color-brand)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[75vh] gap-0 rounded-t-2xl p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-8 rounded-full bg-[var(--color-border)]" />
          </div>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchorRef}
          side="bottom"
          align="end"
          sideOffset={4}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup className="flex max-h-[70vh] w-[560px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--dg-radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-menu)] outline-hidden">
            {content}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[var(--color-border-light)] py-4 first:pt-1 last:border-b-0">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 w-full last:mb-0">
      <div className="mb-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// Interactive sibling of <StatusPill>: same tonal language, but a toggleable button.
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
        active
          ? "border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] text-[var(--color-brand)]"
          : "border-[var(--color-border-light)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-light)]"
      }`}
    >
      {children}
    </button>
  );
}

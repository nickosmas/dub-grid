"use client";

import type { Department, FocusArea, NamedItem } from "@/types";
import { FilterChip, FilterGroup, FilterPanelShell, FilterSection } from "./FilterPanelShell";
import type {
  AccountLinkFilter,
  CertificationFilter,
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
  filterCertification: CertificationFilter;
  onFilterCertificationChange: (value: CertificationFilter) => void;
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
  return (
    <FilterPanelShell
      anchorRef={anchorRef}
      hasActiveFilters={hasActiveFilters}
      open={open}
      title="Staff filters"
      onClearAll={onClearAll}
      onClose={onClose}
    >
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
          <label className="mt-2 flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--dg-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--dg-color-bg-secondary)]">
            <input
              type="checkbox"
              checked={filterDepartmentAdminOnly}
              onChange={(event) => onFilterDepartmentAdminOnlyChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--dg-color-brand)]"
            />
            <span className="text-xs font-medium text-[var(--dg-color-text-secondary)]">
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
            {/* The two presence cases, matching the People page's
              certified/support counts. */}
            <FilterChip
              active={filterCertification === "any"}
              onClick={() => onFilterCertificationChange("any")}
            >
              Certified staff
            </FilterChip>
            <FilterChip
              active={filterCertification === "none"}
              onClick={() => onFilterCertificationChange("none")}
            >
              Not certified
            </FilterChip>
            {certifications.map((certification) => (
              <FilterChip
                key={certification.id}
                active={filterCertification === certification.id}
                onClick={() => onFilterCertificationChange(certification.id)}
              >
                {certification.name}
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
                {role.name}
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
    </FilterPanelShell>
  );
}

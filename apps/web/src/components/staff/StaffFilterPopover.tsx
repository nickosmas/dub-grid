"use client";

import { ORG_ROLE_LABELS, ORG_ROLE_PRIVILEGE_ORDER } from "@dubgrid/domain";
import CustomSelect, { type SelectOption } from "@/components/CustomSelect";
import { SpanTabs, type SpanTabItem } from "@/components/ui/span-tabs";
import type { Department, FocusArea, NamedItem } from "@/types";
import { FilterDivider, FilterField, FilterPanelShell } from "./FilterPanelShell";
import { STAFF_ACCOUNT_STATES, STAFF_ACCOUNT_STATE_LABELS } from "./staff-account-state";
import type {
  AccountStateFilter,
  CertificationFilter,
  EmploymentTypeFilter,
  OrgRoleFilter,
  PhonePresenceFilter,
} from "./useStaffFilters";

const EMPLOYMENT_ITEMS: SpanTabItem<EmploymentTypeFilter>[] = [
  { value: "all", label: "All" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
];

const ACCESS_ROLE_ITEMS: SpanTabItem<OrgRoleFilter>[] = [
  { value: "all", label: "All" },
  ...ORG_ROLE_PRIVILEGE_ORDER.map((role) => ({ value: role, label: ORG_ROLE_LABELS[role] })),
];

const PHONE_ITEMS: SpanTabItem<PhonePresenceFilter>[] = [
  { value: "all", label: "All" },
  { value: "present", label: "Has phone" },
  { value: "missing", label: "Missing phone" },
];

const ACCOUNT_OPTIONS: SelectOption<AccountStateFilter>[] = [
  { value: "all", label: "All" },
  ...STAFF_ACCOUNT_STATES.map((state) => ({
    value: state,
    label: STAFF_ACCOUNT_STATE_LABELS[state],
  })),
];

type IdFilter = number | "all";

function idOptions(items: readonly { id: number; name: string }[]): SelectOption<IdFilter>[] {
  return [
    { value: "all", label: "All" },
    ...items.map((item) => ({ value: item.id, label: item.name })),
  ];
}

const toIdFilter = (id: number | null): IdFilter => id ?? "all";
const fromIdFilter = (value: IdFilter): number | null => (value === "all" ? null : value);

interface StaffFilterPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  filterEmploymentType: EmploymentTypeFilter;
  onFilterEmploymentTypeChange: (value: EmploymentTypeFilter) => void;
  filterDepartment: number | null;
  onFilterDepartmentChange: (id: number | null) => void;
  filterFocusArea: number | null;
  onFilterFocusAreaChange: (id: number | null) => void;
  filterCertification: CertificationFilter;
  onFilterCertificationChange: (value: CertificationFilter) => void;
  filterRole: number | null;
  onFilterRoleChange: (id: number | null) => void;
  filterAccount: AccountStateFilter;
  onFilterAccountChange: (value: AccountStateFilter) => void;
  filterPhonePresence: PhonePresenceFilter;
  onFilterPhonePresenceChange: (value: PhonePresenceFilter) => void;
  filterOrgRole: OrgRoleFilter;
  onFilterOrgRoleChange: (value: OrgRoleFilter) => void;
  /**
   * Access is admin-only information, and the tier map behind it is only
   * loaded for viewers who can read the directory. Off, the filter would be
   * answering about a column this viewer cannot see.
   */
  showAccessControls: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  departments: Department[];
  focusAreaLabel: string;
  certificationLabel: string;
  roleLabel: string;
  departmentLabel: string;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  showAdministrativeFilters?: boolean;
}

export function StaffFilterPopover({
  open,
  onClose,
  anchorRef,
  filterEmploymentType,
  onFilterEmploymentTypeChange,
  filterDepartment,
  onFilterDepartmentChange,
  filterFocusArea,
  onFilterFocusAreaChange,
  filterCertification,
  onFilterCertificationChange,
  filterRole,
  onFilterRoleChange,
  filterAccount,
  onFilterAccountChange,
  filterPhonePresence,
  onFilterPhonePresenceChange,
  filterOrgRole,
  onFilterOrgRoleChange,
  showAccessControls,
  focusAreas,
  certifications,
  roles,
  departments,
  focusAreaLabel,
  certificationLabel,
  roleLabel,
  departmentLabel,
  onClearAll,
  hasActiveFilters,
  showAdministrativeFilters = true,
}: StaffFilterPopoverProps) {
  // The two presence cases match the People page's certified and not
  // certified counts.
  const certificationOptions: SelectOption<Exclude<CertificationFilter, null> | "all">[] = [
    { value: "all", label: "All" },
    { value: "any", label: "Certified staff" },
    { value: "none", label: "Not certified" },
    ...certifications.map((certification) => ({
      value: certification.id,
      label: certification.name,
    })),
  ];
  const showAccountGroup = showAdministrativeFilters || showAccessControls;

  return (
    <FilterPanelShell
      anchorRef={anchorRef}
      hasActiveFilters={hasActiveFilters}
      open={open}
      onClearAll={onClearAll}
      onClose={onClose}
    >
      {showAdministrativeFilters && (
        <FilterField label="Employment">
          <SpanTabs
            aria-label="Employment"
            items={EMPLOYMENT_ITEMS}
            value={filterEmploymentType}
            onChange={onFilterEmploymentTypeChange}
          />
        </FilterField>
      )}

      {showAdministrativeFilters && departments.length > 0 && (
        <FilterField label={departmentLabel}>
          <CustomSelect
            ariaLabel={departmentLabel}
            value={toIdFilter(filterDepartment)}
            options={idOptions(departments)}
            onChange={(value) => onFilterDepartmentChange(fromIdFilter(value))}
          />
        </FilterField>
      )}

      {focusAreas.length > 0 && (
        <FilterField label={focusAreaLabel}>
          <CustomSelect
            ariaLabel={focusAreaLabel}
            value={toIdFilter(filterFocusArea)}
            options={idOptions(focusAreas)}
            onChange={(value) => onFilterFocusAreaChange(fromIdFilter(value))}
          />
        </FilterField>
      )}

      {certifications.length > 0 && (
        <FilterField label={certificationLabel}>
          <CustomSelect
            ariaLabel={certificationLabel}
            value={filterCertification ?? "all"}
            options={certificationOptions}
            onChange={(value) => onFilterCertificationChange(value === "all" ? null : value)}
          />
        </FilterField>
      )}

      {roles.length > 0 && (
        <FilterField label={roleLabel}>
          <CustomSelect
            ariaLabel={roleLabel}
            value={toIdFilter(filterRole)}
            options={idOptions(roles)}
            onChange={(value) => onFilterRoleChange(fromIdFilter(value))}
          />
        </FilterField>
      )}

      {showAccountGroup && <FilterDivider />}

      {showAdministrativeFilters && (
        <FilterField label="Account">
          <CustomSelect
            ariaLabel="Account"
            value={filterAccount}
            options={ACCOUNT_OPTIONS}
            onChange={onFilterAccountChange}
          />
        </FilterField>
      )}

      {showAccessControls && (
        <FilterField label="Access role">
          <SpanTabs
            aria-label="Access role"
            items={ACCESS_ROLE_ITEMS}
            value={filterOrgRole}
            onChange={onFilterOrgRoleChange}
          />
        </FilterField>
      )}

      {showAdministrativeFilters && (
        <FilterField label="Phone">
          <SpanTabs
            aria-label="Phone"
            items={PHONE_ITEMS}
            value={filterPhonePresence}
            onChange={onFilterPhonePresenceChange}
          />
        </FilterField>
      )}
    </FilterPanelShell>
  );
}

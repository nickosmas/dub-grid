"use client";

import { ORG_ROLE_LABELS, ORG_ROLE_PRIVILEGE_ORDER } from "@dubgrid/domain";
import { CheckboxChoices, type CheckboxChoice } from "@/components/ui/checkbox-choices";
import type { Department, FocusArea, NamedItem, OrganizationRole } from "@/types";
import { FilterDivider, FilterField, FilterPanelShell } from "./FilterPanelShell";
import {
  STAFF_ACCOUNT_STATES,
  STAFF_ACCOUNT_STATE_LABELS,
  type StaffAccountState,
} from "./staff-account-state";
import type {
  AccountStateFilter,
  CertificationChoice,
  CertificationFilter,
  EmploymentType,
  EmploymentTypeFilter,
  IdFilter,
  OrgRoleFilter,
  PhonePresence,
  PhonePresenceFilter,
} from "./useStaffFilters";

const EMPLOYMENT_ITEMS: CheckboxChoice<EmploymentType>[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
];

const ACCESS_ROLE_ITEMS: CheckboxChoice<OrganizationRole>[] = ORG_ROLE_PRIVILEGE_ORDER.map(
  (role) => ({ value: role, label: ORG_ROLE_LABELS[role] }),
);

const PHONE_ITEMS: CheckboxChoice<PhonePresence>[] = [
  { value: "present", label: "Has phone" },
  { value: "missing", label: "Missing phone" },
];

const ACCOUNT_ITEMS: CheckboxChoice<StaffAccountState>[] = STAFF_ACCOUNT_STATES.map((state) => ({
  value: state,
  label: STAFF_ACCOUNT_STATE_LABELS[state],
}));

function idItems(items: readonly { id: number; name: string }[]): CheckboxChoice<number>[] {
  return items.map((item) => ({ value: item.id, label: item.name }));
}

/** A filter's Clear, offered only once something in it is ticked. */
function clearIfSet<T>(value: readonly T[], onChange: (value: T[]) => void) {
  return value.length > 0 ? () => onChange([]) : undefined;
}

interface StaffFilterPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: HTMLElement | null;
  filterEmploymentType: EmploymentTypeFilter;
  onFilterEmploymentTypeChange: (value: EmploymentType[]) => void;
  filterDepartment: IdFilter;
  onFilterDepartmentChange: (ids: number[]) => void;
  filterFocusArea: IdFilter;
  onFilterFocusAreaChange: (ids: number[]) => void;
  filterCertification: CertificationFilter;
  onFilterCertificationChange: (value: CertificationChoice[]) => void;
  filterRole: IdFilter;
  onFilterRoleChange: (ids: number[]) => void;
  filterAccount: AccountStateFilter;
  onFilterAccountChange: (value: StaffAccountState[]) => void;
  filterPhonePresence: PhonePresenceFilter;
  onFilterPhonePresenceChange: (value: PhonePresence[]) => void;
  filterOrgRole: OrgRoleFilter;
  onFilterOrgRoleChange: (value: OrganizationRole[]) => void;
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
  const certificationItems: CheckboxChoice<CertificationChoice>[] = [
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
        <FilterField
          label="Employment"
          onClear={clearIfSet(filterEmploymentType, onFilterEmploymentTypeChange)}
        >
          <CheckboxChoices
            aria-label="Employment"
            items={EMPLOYMENT_ITEMS}
            value={filterEmploymentType}
            onChange={onFilterEmploymentTypeChange}
          />
        </FilterField>
      )}

      {showAdministrativeFilters && departments.length > 0 && (
        <FilterField
          label={departmentLabel}
          onClear={clearIfSet(filterDepartment, onFilterDepartmentChange)}
        >
          <CheckboxChoices
            aria-label={departmentLabel}
            items={idItems(departments)}
            value={filterDepartment}
            onChange={onFilterDepartmentChange}
          />
        </FilterField>
      )}

      {focusAreas.length > 0 && (
        <FilterField
          label={focusAreaLabel}
          onClear={clearIfSet(filterFocusArea, onFilterFocusAreaChange)}
        >
          <CheckboxChoices
            aria-label={focusAreaLabel}
            items={idItems(focusAreas)}
            value={filterFocusArea}
            onChange={onFilterFocusAreaChange}
          />
        </FilterField>
      )}

      {certifications.length > 0 && (
        <FilterField
          label={certificationLabel}
          onClear={clearIfSet(filterCertification, onFilterCertificationChange)}
        >
          <CheckboxChoices
            aria-label={certificationLabel}
            items={certificationItems}
            value={filterCertification}
            onChange={onFilterCertificationChange}
          />
        </FilterField>
      )}

      {roles.length > 0 && (
        <FilterField label={roleLabel} onClear={clearIfSet(filterRole, onFilterRoleChange)}>
          <CheckboxChoices
            aria-label={roleLabel}
            items={idItems(roles)}
            value={filterRole}
            onChange={onFilterRoleChange}
          />
        </FilterField>
      )}

      {showAccountGroup && <FilterDivider />}

      {showAdministrativeFilters && (
        <FilterField label="Account" onClear={clearIfSet(filterAccount, onFilterAccountChange)}>
          <CheckboxChoices
            aria-label="Account"
            items={ACCOUNT_ITEMS}
            value={filterAccount}
            onChange={onFilterAccountChange}
          />
        </FilterField>
      )}

      {showAccessControls && (
        <FilterField label="Access role" onClear={clearIfSet(filterOrgRole, onFilterOrgRoleChange)}>
          <CheckboxChoices
            aria-label="Access role"
            items={ACCESS_ROLE_ITEMS}
            value={filterOrgRole}
            onChange={onFilterOrgRoleChange}
          />
        </FilterField>
      )}

      {showAdministrativeFilters && (
        <FilterField
          label="Phone"
          onClear={clearIfSet(filterPhonePresence, onFilterPhonePresenceChange)}
        >
          <CheckboxChoices
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

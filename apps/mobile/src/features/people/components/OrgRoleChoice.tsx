import { canGrantOrgRole, getOrgRoleGrantRefusal } from "@dubgrid/domain";
import { SelectionRow, SelectionSection } from "../../../shared/components/FilterSheet";
import { ORG_ROLE_LABELS } from "../lib/orgRoleBadges";
import { ORG_ROLE_OPTIONS, type OrgRole } from "./OrgRoleSheet";

/**
 * The access role as the same described radio list `OrgRoleSheet` shows,
 * for the sheets that grant a role as part of an invitation. Only a Super
 * Admin gives an elevated tier, as on web (F-237): anyone else sees Admin
 * listed but unavailable, with why, and no Super Admin.
 */
export function OrgRoleChoice({
  value,
  canGrantElevatedRoles,
  disabled = false,
  label = "Access role",
  onChange,
}: {
  value: OrgRole;
  canGrantElevatedRoles: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (role: OrgRole) => void;
}) {
  const actor = { isSuperAdmin: canGrantElevatedRoles, isGridmaster: false };
  const options = canGrantElevatedRoles
    ? ORG_ROLE_OPTIONS
    : ORG_ROLE_OPTIONS.filter((option) => option.value !== "super_admin");

  return (
    <SelectionSection label={label}>
      {options.map((option) => {
        const grantable = canGrantOrgRole(actor, option.value);
        return (
          <SelectionRow
            detail={grantable ? option.detail : getOrgRoleGrantRefusal(option.value)}
            disabled={disabled || !grantable}
            key={option.value}
            label={ORG_ROLE_LABELS[option.value]}
            onPress={() => onChange(option.value)}
            selected={option.value === value}
          />
        );
      })}
    </SelectionSection>
  );
}

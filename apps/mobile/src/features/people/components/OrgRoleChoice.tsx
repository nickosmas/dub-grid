import { SelectionRow, SelectionSection } from "../../../shared/components/FilterSheet";
import { ORG_ROLE_LABELS } from "../lib/orgRoleBadges";
import { ORG_ROLE_OPTIONS, type OrgRole } from "./OrgRoleSheet";

/**
 * The access level as the same described radio list `OrgRoleSheet` shows,
 * for the sheets that grant a role as part of an invitation. Super Admin is
 * offered only by someone who holds it, as on web.
 */
export function OrgRoleChoice({
  value,
  canGrantSuperAdmin,
  disabled = false,
  label = "Access level",
  onChange,
}: {
  value: OrgRole;
  canGrantSuperAdmin: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (role: OrgRole) => void;
}) {
  const options = canGrantSuperAdmin
    ? ORG_ROLE_OPTIONS
    : ORG_ROLE_OPTIONS.filter((option) => option.value !== "super_admin");

  return (
    <SelectionSection label={label}>
      {options.map((option) => (
        <SelectionRow
          detail={option.detail}
          disabled={disabled}
          key={option.value}
          label={ORG_ROLE_LABELS[option.value]}
          onPress={() => onChange(option.value)}
          selected={option.value === value}
        />
      ))}
    </SelectionSection>
  );
}

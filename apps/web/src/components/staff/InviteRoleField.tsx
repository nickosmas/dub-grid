"use client";

import CustomSelect from "@/components/CustomSelect";
import type { InviteRoleOption } from "@/features/employees/client/invite-on-save";
import type { AssignableOrganizationRole } from "@/types";
import { getOrgRoleGrantRefusal } from "@dubgrid/domain";

interface InviteRoleFieldProps {
  value: AssignableOrganizationRole;
  options: InviteRoleOption[];
  onChange: (role: AssignableOrganizationRole) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * The access role an invite gives: a dropdown when there's a choice, otherwise
 * the one role as plain text, with `InviteRoleRefusal` saying why.
 */
export function InviteRoleField({
  value,
  options,
  onChange,
  ariaLabel = "Access role",
  disabled,
}: InviteRoleFieldProps) {
  if (options.length > 1) {
    return (
      <CustomSelect
        ariaLabel={ariaLabel}
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  return (
    <span
      style={{
        fontSize: "var(--dg-type-control-size)",
        fontWeight: 500,
        color: "var(--dg-color-text-primary)",
      }}
    >
      {options[0]?.label}
    </span>
  );
}

/** Why the invite offers User alone; nothing when it offers a choice. */
export function InviteRoleRefusal({ options }: { options: InviteRoleOption[] }) {
  if (options.length > 1) return null;
  return (
    <div
      style={{
        fontSize: "var(--dg-fs-footnote)",
        color: "var(--dg-color-text-secondary)",
        lineHeight: 1.45,
      }}
    >
      {getOrgRoleGrantRefusal("admin")}
    </div>
  );
}

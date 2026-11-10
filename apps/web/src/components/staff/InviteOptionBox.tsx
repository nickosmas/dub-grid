"use client";

import { InvitePermissionsField } from "@/components/InvitePermissionsField";
import { InviteRoleField, InviteRoleRefusal } from "@/components/staff/InviteRoleField";
import type { InviteRoleOption } from "@/features/employees/client/invite-on-save";
import type { AdminPermissions, AssignableOrganizationRole } from "@/types";

interface InviteOptionBoxProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The access role choice, shown while ticked; a reinvite keeps the replaced invitation's role. */
  role?: {
    value: AssignableOrganizationRole;
    options: InviteRoleOption[];
    onChange: (role: AssignableOrganizationRole) => void;
  };
  /** An Admin's permissions, for a Super Admin inviting an Admin. */
  permissions?: {
    value: AdminPermissions | null;
    onChange: (permissions: AdminPermissions) => void;
  };
  note?: string | null;
  disabled?: boolean;
}

/** The invite option beside an email, the same on the staff page, the People panel and Add Staff Members. */
export function InviteOptionBox({
  label,
  checked,
  onCheckedChange,
  role,
  permissions,
  note,
  disabled = false,
}: InviteOptionBoxProps) {
  return (
    <div
      data-slot="invite-on-save"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--dg-radius-lg)",
        border: `1px solid ${checked ? "var(--dg-color-brand-border)" : "var(--dg-color-border)"}`,
        background: checked ? "var(--dg-color-brand-bg)" : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: disabled ? "default" : "pointer",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 500,
            color: "var(--dg-color-text-primary)",
          }}
        >
          <input
            type="checkbox"
            className="dg-checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onCheckedChange(e.target.checked)}
          />
          {label}
        </label>
        {checked && role ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: "var(--dg-type-field-title-size)",
                fontWeight: "var(--dg-type-field-title-weight)",
                color: "var(--dg-type-field-title-color)",
                letterSpacing: "var(--dg-type-field-title-letter-spacing)",
                lineHeight: "var(--dg-type-field-title-line-height)",
                whiteSpace: "nowrap",
              }}
            >
              Access role
            </span>
            <InviteRoleField
              value={role.value}
              options={role.options}
              onChange={role.onChange}
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>
      {checked && role ? <InviteRoleRefusal options={role.options} /> : null}
      {checked && permissions ? (
        <InvitePermissionsField
          value={permissions.value}
          onChange={permissions.onChange}
          disabled={disabled}
        />
      ) : null}
      {note ? (
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}

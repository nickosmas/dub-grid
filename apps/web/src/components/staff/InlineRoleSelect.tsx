"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type { OrganizationRole } from "@/types";
import { SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ORG_ROLE_LABELS, getOrgRoleBadgeStyle } from "./org-role-badges";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

/**
 * Role dropdown for a directory table cell. When `onChange` is omitted (viewer
 * can't manage access, or the person has no login) it falls back to a read-only
 * badge / em dash. Stops row-click propagation so interacting with the select
 * doesn't open the row's detail panel.
 */
export function InlineRoleSelect({
  orgRole,
  onChange,
  isSelf = false,
}: {
  orgRole: OrganizationRole | null | undefined;
  onChange?: (newRole: OrganizationRole) => Promise<void>;
  isSelf?: boolean;
}) {
  const [pending, setPending] = useState<OrganizationRole | null>(null);
  const [saving, setSaving] = useState(false);

  // Self can't change own role: show the dropdown in its disabled state so
  // the Access column reads consistently across rows. Title explains why.
  if (orgRole && isSelf) {
    return (
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ minWidth: 132, maxWidth: 168 }}
        title={SELF_ACTION_FORBIDDEN_MESSAGE}
      >
        <CustomSelect value={orgRole} disabled onChange={() => undefined} options={ROLE_OPTIONS} />
      </div>
    );
  }

  // No edit permission / no login: read-only badge or em dash.
  if (!orgRole || !onChange) {
    return orgRole ? (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
        style={getOrgRoleBadgeStyle(orgRole)}
      >
        {ORG_ROLE_LABELS[orgRole]}
      </span>
    ) : (
      <span className="text-[12px] text-[var(--dg-color-text-muted)]">{"—"}</span>
    );
  }

  return (
    <div onClick={(event) => event.stopPropagation()} style={{ minWidth: 132, maxWidth: 168 }}>
      <CustomSelect
        value={orgRole}
        disabled={saving}
        onChange={(value) => {
          if (value !== orgRole) setPending(value);
        }}
        options={ROLE_OPTIONS}
      />
      {pending && (
        <ConfirmDialog
          title="Change role"
          message={`Change this person's role to ${ORG_ROLE_LABELS[pending]}? Their access updates immediately.`}
          confirmLabel="Change role"
          confirmPendingLabel="Changing role"
          variant="warning"
          isLoading={saving}
          onCancel={() => {
            if (saving) return;
            setPending(null);
          }}
          onConfirm={async () => {
            const next = pending;
            setSaving(true);
            try {
              await onChange(next);
              toast.success(`Role updated to ${ORG_ROLE_LABELS[next]}.`);
              setPending(null);
            } catch (error) {
              toast.error(
                formatClientErrorMessage(error, "We couldn't change that role. Try again."),
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </div>
  );
}

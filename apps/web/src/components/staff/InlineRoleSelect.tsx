"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { OrganizationRole } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ORG_ROLE_LABELS, getOrgRoleBadgeStyle } from "./org-role-badges";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: "user", label: "Member" },
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
}: {
  orgRole: OrganizationRole | null | undefined;
  onChange?: (newRole: OrganizationRole) => Promise<void>;
}) {
  const [pending, setPending] = useState<OrganizationRole | null>(null);
  const [saving, setSaving] = useState(false);

  if (!orgRole || !onChange) {
    return orgRole ? (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
        style={getOrgRoleBadgeStyle(orgRole)}
      >
        {ORG_ROLE_LABELS[orgRole]}
      </span>
    ) : (
      <span className="text-[12px] text-[var(--color-text-muted)]">{"—"}</span>
    );
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{ minWidth: 132, maxWidth: 168 }}
    >
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
          variant="warning"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const next = pending;
            setSaving(true);
            void (async () => {
              try {
                await onChange(next);
                setPending(null);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not change the role.",
                );
              } finally {
                setSaving(false);
              }
            })();
          }}
        />
      )}
    </div>
  );
}

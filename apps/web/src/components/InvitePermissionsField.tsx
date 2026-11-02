"use client";

import { useState } from "react";
import { buildInitialPermissions, countPermissionLevels } from "@dubgrid/authz";
import { Button } from "@/components/Button";
import PermissionsEditor from "@/components/PermissionsEditor";
import { useOrganizationData } from "@/hooks";
import type { AdminPermissions } from "@/types";

/**
 * An Admin invite's permissions, chosen before it goes out (113). Opens the
 * same editor a joined Admin's permissions use; nothing is saved until the
 * invite is sent. Null means the standard Admin set.
 */
export function InvitePermissionsField({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminPermissions | null;
  onChange: (permissions: AdminPermissions) => void;
  disabled?: boolean;
}) {
  const { org } = useOrganizationData();
  const [open, setOpen] = useState(false);
  const { enabled, total } = countPermissionLevels(buildInitialPermissions(value));

  return (
    <div>
      <span className="dg-label">Permissions</span>
      <div className="flex items-center justify-between gap-3">
        <span className="dg-tabular-nums text-[length:var(--dg-fs-body-sm)] text-[var(--dg-color-text-secondary)]">
          {enabled} of {total} on
        </span>
        <Button
          type="button"
          className="dg-btn dg-btn-secondary dg-btn-sm"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Set permissions
        </Button>
      </div>
      {open && (
        <PermissionsEditor
          title="Set permissions"
          subtitle="Choose what this admin can view and manage. They apply when the invite is accepted."
          initialPermissions={value}
          showPermissionCounter
          labels={{
            focusAreaLabel: org?.focusAreaLabel,
            certificationLabel: org?.certificationLabel,
            roleLabel: org?.roleLabel,
          }}
          onSave={async (perms) => {
            onChange(perms);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

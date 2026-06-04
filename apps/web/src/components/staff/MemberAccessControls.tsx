"use client";

import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import type { AdminPermissions, OrganizationRole } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionsEditor from "@/components/PermissionsEditor";

const ROLE_LABELS: Record<OrganizationRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

// Matches the panels' field labels (e.g. First name / Phone) so the access
// fields read as part of the same form rather than a bare browser <label>.
const DEFAULT_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

/**
 * Role dropdown + permission-matrix launcher for a member's org access.
 * Self-gates on the callbacks, which callers pass only to super_admins /
 * gridmasters. Shared by the directory's management panel and on-schedule
 * staff panel so the controls live in exactly one place.
 */
export function MemberAccessControls({
  orgRole,
  adminPermissions,
  onRoleChange,
  onPermissionsChange,
  labelStyle,
  isSelf = false,
}: {
  orgRole: OrganizationRole | null | undefined;
  adminPermissions?: AdminPermissions | null;
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
  labelStyle?: CSSProperties;
  isSelf?: boolean;
}) {
  const [pendingRole, setPendingRole] = useState<OrganizationRole | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  if (!onRoleChange && !onPermissionsChange) return null;

  const fieldLabelStyle = labelStyle ?? DEFAULT_LABEL_STYLE;

  return (
    <>
      {onRoleChange && orgRole && isSelf && (
        <div>
          <label style={fieldLabelStyle}>Role</label>
          <div style={{ maxWidth: 240 }}>
            <CustomSelect value={orgRole} disabled onChange={() => {}} options={[{ value: orgRole, label: ROLE_LABELS[orgRole] ?? orgRole }]} />
          </div>
        </div>
      )}
      {onRoleChange && orgRole && !isSelf && (
        <div>
          <label style={fieldLabelStyle}>Role</label>
          <div style={{ maxWidth: 240 }}>
            <CustomSelect
            value={orgRole}
            disabled={changingRole}
            onChange={(value) => {
              if (value !== orgRole) setPendingRole(value);
            }}
            options={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
              { value: "super_admin", label: "Super Admin" },
            ]}
            />
          </div>
          {pendingRole && (
            <ConfirmDialog
              title="Change role"
              message={`Change this person's role to ${ROLE_LABELS[pendingRole] ?? pendingRole}? Their access updates immediately.`}
              confirmLabel="Change role"
              variant="warning"
              onCancel={() => setPendingRole(null)}
              onConfirm={() => {
                const next = pendingRole;
                setChangingRole(true);
                void (async () => {
                  try {
                    await onRoleChange(next);
                    setPendingRole(null);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not change the role.",
                    );
                  } finally {
                    setChangingRole(false);
                  }
                })();
              }}
            />
          )}
        </div>
      )}
      {onPermissionsChange && orgRole === "admin" && (
        <div>
          <label style={fieldLabelStyle}>Permissions</label>
          <div>
            <button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              onClick={() => setShowPermissions(true)}
            >
              Manage permissions
            </button>
          </div>
          {showPermissions && (
            <PermissionsEditor
              title="Edit permissions"
              subtitle="Choose what this admin can view and manage."
              initialPermissions={adminPermissions}
              showPermissionCounter
              lockedFalse={["canManageOrgSettings"]}
              onSave={async (perms) => {
                await onPermissionsChange(perms);
                setShowPermissions(false);
              }}
              onClose={() => setShowPermissions(false)}
            />
          )}
        </div>
      )}
    </>
  );
}

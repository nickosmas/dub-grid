"use client";

import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { Button } from "@/components/Button";
import type { AdminPermissions, OrganizationRole } from "@/types";
import { SELF_ACTION_FORBIDDEN_MESSAGE } from "@dubgrid/domain";
import CustomSelect from "@/components/CustomSelect";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionsEditor, { type PermissionEditorLabels } from "@/components/PermissionsEditor";
import { buildAdminPermissionChanges } from "@/lib/access-management";

const ROLE_LABELS: Record<OrganizationRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

// Matches the panels' field labels (e.g. First name / Phone) so the access
// fields read as part of the same form rather than a bare browser <label>.
const DEFAULT_LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  color: "var(--dg-type-field-title-color)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
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
  pendingInvitationEmail,
  labels,
  showRole = true,
  showPermissionControl = true,
}: {
  orgRole: OrganizationRole | null | undefined;
  adminPermissions?: AdminPermissions | null;
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  onPermissionsChange?: (perms: AdminPermissions) => Promise<void>;
  labelStyle?: CSSProperties;
  isSelf?: boolean;
  pendingInvitationEmail?: string;
  /** Org terminology for the editor's row descriptions; defaults apply when absent. */
  labels?: Partial<PermissionEditorLabels>;
  /** Lets a panel place the role selector in its header and permissions in its body. */
  showRole?: boolean;
  showPermissionControl?: boolean;
}) {
  const [pendingRole, setPendingRole] = useState<OrganizationRole | null>(null);
  const [changingRole, setChangingRole] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  if (!onRoleChange && !onPermissionsChange) return null;

  const fieldLabelStyle = labelStyle ?? DEFAULT_LABEL_STYLE;

  return (
    <>
      {showRole && onRoleChange && orgRole && isSelf && (
        <div>
          <label style={fieldLabelStyle}>Role</label>
          <div style={{ maxWidth: 240 }}>
            <CustomSelect
              value={orgRole}
              disabled
              onChange={() => {}}
              options={[{ value: orgRole, label: ROLE_LABELS[orgRole] ?? orgRole }]}
            />
          </div>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--dg-color-text-muted)",
            }}
          >
            {SELF_ACTION_FORBIDDEN_MESSAGE}
          </p>
        </div>
      )}
      {showRole && onRoleChange && orgRole && !isSelf && (
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
              title={pendingInvitationEmail ? "Replace invitation access?" : "Change role"}
              message={
                pendingInvitationEmail
                  ? `Change access from ${ROLE_LABELS[orgRole] ?? orgRole} to ${ROLE_LABELS[pendingRole] ?? pendingRole}? The current invitation will be revoked and a replacement will be sent to ${pendingInvitationEmail}.`
                  : `Change this person's role to ${ROLE_LABELS[pendingRole] ?? pendingRole}? Their access updates immediately.`
              }
              confirmLabel={pendingInvitationEmail ? "Revoke and resend" : "Change role"}
              variant="warning"
              onCancel={() => setPendingRole(null)}
              // Awaited rather than fired into a `void` IIFE: the dialog stays
              // open until the role change lands, so it needs the promise to
              // hold its own latch and spinner. Discarding it left the confirm
              // button idle-looking and double-clickable for the whole request.
              onConfirm={async () => {
                const next = pendingRole;
                setChangingRole(true);
                try {
                  await onRoleChange(next);
                  toast.success(
                    pendingInvitationEmail
                      ? `Invitation replaced with ${ROLE_LABELS[next] ?? next} access.`
                      : `Role updated to ${ROLE_LABELS[next] ?? next}.`,
                  );
                  setPendingRole(null);
                } catch (error) {
                  toast.error(
                    formatClientErrorMessage(error, "We couldn't change that role. Try again."),
                  );
                } finally {
                  setChangingRole(false);
                }
              }}
            />
          )}
        </div>
      )}
      {showPermissionControl && onPermissionsChange && orgRole === "admin" && (
        <div>
          <label style={fieldLabelStyle}>Permissions</label>
          <div>
            <Button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn-sm"
              onClick={() => setShowPermissions(true)}
            >
              Manage permissions
            </Button>
          </div>
          {showPermissions && (
            <PermissionsEditor
              title="Edit permissions"
              subtitle="Choose what this admin can view and manage."
              initialPermissions={adminPermissions}
              showPermissionCounter
              labels={labels}
              buildReview={(perms, initial) => {
                const changes = buildAdminPermissionChanges(initial, perms);
                return changes.length > 0
                  ? {
                      title: "Review permission changes",
                      description:
                        "Review these changes before saving. They take effect for this admin right away.",
                      changes,
                      confirmLabel: "Confirm save",
                    }
                  : null;
              }}
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

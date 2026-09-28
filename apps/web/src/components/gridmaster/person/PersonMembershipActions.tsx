"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import PermissionsEditor from "@/components/PermissionsEditor";
import { requireCredentialAssurance } from "@/features/account/client";
import {
  OrganizationAccessConflictError,
  removeOrganizationMembershipGuarded,
  updateOrganizationMembershipGuarded,
} from "@/features/organization/client";
import type { GridmasterPersonOrganization } from "@/features/gridmaster/person-record";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { buildMembershipAccessChanges } from "@/lib/access-management";
import { formatClientErrorMessage, formatOrganizationRoleLabel } from "@/lib/client-facing";
import type { AssignableOrganizationRole } from "@/types";

const ROLE_OPTIONS: { value: AssignableOrganizationRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

const CONFLICT_MESSAGE = "Their access changed elsewhere. Review the latest values and try again.";

/**
 * Role, permissions and removal for one organization's membership, through
 * the same guarded routes and step-up the organization's Users tab uses.
 */
export function PersonMembershipActions({
  organization,
  userId,
  name,
  onChanged,
}: {
  organization: GridmasterPersonOrganization;
  userId: string;
  name: string;
  onChanged: () => void;
}) {
  const stepUp = useStepUpAction();
  const membership = organization.membership;
  const orgId = organization.org.id;
  const [roleConfirm, setRoleConfirm] = useState(false);
  const [nextRole, setNextRole] = useState<AssignableOrganizationRole>("user");
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!membership || membership.archivedAt) return null;
  const expectedUpdatedAt = membership.updatedAt;
  const currentPermissions = membership.adminPermissions;

  function handleFailure(error: unknown, fallback: string) {
    if (error instanceof OrganizationAccessConflictError) {
      toast.error(CONFLICT_MESSAGE);
      onChanged();
      return;
    }
    toast.error(formatClientErrorMessage(error, fallback));
  }

  async function handleRoleChange() {
    setBusy(true);
    try {
      // A Gridmaster's role change needs fresh proof (41d3, F-16).
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await updateOrganizationMembershipGuarded(
          {
            orgId,
            userId,
            expectedUpdatedAt,
            orgRole: nextRole,
            adminPermissions: nextRole === "admin" ? currentPermissions : null,
          },
          accessToken,
        );
      });
      if (!completed) return;
      toast.success("Role updated");
      setRoleConfirm(false);
      onChanged();
    } catch (error) {
      handleFailure(error, "We couldn't change their role. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      // Removing someone from an organization needs fresh proof (F-96).
      const completed = await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        await removeOrganizationMembershipGuarded(
          { orgId, userId, expectedUpdatedAt },
          accessToken,
        );
      });
      if (!completed) return;
      toast.success(`Removed from ${organization.org.name}`);
      setRemoveConfirm(false);
      onChanged();
    } catch (error) {
      handleFailure(error, "We couldn't remove their access. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => {
          setNextRole(membership.orgRole === "user" ? "admin" : "user");
          setRoleConfirm(true);
        }}
        disabled={busy}
      >
        Change role
      </Button>
      {membership.orgRole === "admin" ? (
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => setEditingPermissions(true)}
          disabled={busy}
        >
          Edit permissions
        </Button>
      ) : null}
      <Button
        className="dg-btn dg-btn-secondary"
        onClick={() => setRemoveConfirm(true)}
        disabled={busy}
      >
        Remove from organization
      </Button>

      {roleConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Change role"
          message={
            <div className="flex flex-col gap-3">
              <span>
                {name} is {formatOrganizationRoleLabel(membership.orgRole)} in{" "}
                {organization.org.name}. Their new role applies at their next sign-in.
              </span>
              <CustomSelect
                ariaLabel="New role"
                value={nextRole}
                options={ROLE_OPTIONS.filter((option) => option.value !== membership.orgRole)}
                onChange={setNextRole}
              />
            </div>
          }
          confirmLabel="Change role"
          variant="warning"
          isLoading={busy}
          onConfirm={handleRoleChange}
          onCancel={() => setRoleConfirm(false)}
        />
      )}

      {removeConfirm && !stepUp.dialog && (
        <ConfirmDialog
          title="Remove from organization"
          message={`Remove ${name} from ${organization.org.name}? They lose access to it now. Their staff record stays.`}
          confirmLabel="Remove"
          variant="danger"
          isLoading={busy}
          onConfirm={handleRemove}
          onCancel={() => setRemoveConfirm(false)}
        />
      )}

      {editingPermissions && (
        <PermissionsEditor
          title={`Admin permissions: ${name}`}
          subtitle={
            <>
              Configure which actions this admin can perform. <em>View Schedule</em> and{" "}
              <em>View Staff</em> are always enabled.
            </>
          }
          initialPermissions={membership.adminPermissions}
          showPermissionCounter
          buildReview={(permissions, initial) => {
            const changes = buildMembershipAccessChanges(
              { orgRole: membership.orgRole, adminPermissions: initial },
              { orgRole: membership.orgRole, adminPermissions: permissions },
            );
            return changes.length > 0
              ? {
                  title: "Review Permission Changes",
                  description:
                    "Review these permission changes before saving. Admin access changes affect what this person can see and do across the organization.",
                  changes,
                  confirmLabel: "Confirm Save",
                  warningText: "This save updates sensitive admin permissions.",
                }
              : null;
          }}
          obscured={Boolean(stepUp.dialog)}
          onSave={async (permissions) => {
            try {
              // A Gridmaster's permission change needs fresh proof (41d4, F-61).
              const completed = await stepUp.run(async (accessToken) => {
                await requireCredentialAssurance(accessToken);
                await updateOrganizationMembershipGuarded(
                  { orgId, userId, expectedUpdatedAt, adminPermissions: permissions },
                  accessToken,
                );
              });
              if (!completed) return false;
              toast.success("Permissions updated");
              onChanged();
            } catch (error) {
              if (error instanceof OrganizationAccessConflictError) {
                toast.error(CONFLICT_MESSAGE);
                onChanged();
              }
              throw error;
            }
          }}
          onClose={() => setEditingPermissions(false)}
        />
      )}
      {stepUp.dialog}
    </>
  );
}

"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import {
  fetchOrganizationUsers,
  createOrganizationInvitation,
  revokeOrganizationInvitationGuarded,
  updateOrganizationInvitationGuarded,
  updateOrganizationMembershipGuarded,
  OrganizationAccessConflictError,
  InvitationAccessConflictError,
  updateAppOnlyUser,
} from "@/features/organization/client";
import { useIsInSandbox } from "@/hooks";
import { toast } from "sonner";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { SectionNotice } from "@/components/ui/SectionNotice";
import CustomSelect from "@/components/CustomSelect";
import type {
  AssignableOrganizationRole,
  Department,
  DirectoryPerson,
  Employee,
  Invitation,
  OrganizationUser,
} from "@/types";

interface EmployeeManagementAccessEditorProps {
  employee: Employee;
  orgId: string;
  orgName: string;
  managementDepartments: Department[];
  directoryPerson?: DirectoryPerson | null;
  pendingInvitation?: Invitation;
  onClose: () => void;
  onCompleted: (updatedEmployee?: Employee | null) => void | Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  hideActions?: boolean;
}

export interface EmployeeManagementAccessEditorHandle {
  save: () => Promise<void>;
  discard: () => void;
}

const INVITE_ROLE_OPTIONS: { value: AssignableOrganizationRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

/**
 * In-place editor shared by every management-access popup. It edits
 * management departments and nothing else: role and permissions are changed on
 * the person's own surface (the slide-over header and body, the detail page's
 * Access card), so the popup is the same popup wherever it is opened from.
 *
 * The one exception is a brand-new invitation. Nothing yet exists to hold a
 * role for someone with no membership and no pending invite, so the picker
 * appears here, once, to say what role the invitation will carry.
 */
export const EmployeeManagementAccessEditor = forwardRef<
  EmployeeManagementAccessEditorHandle,
  EmployeeManagementAccessEditorProps
>(function EmployeeManagementAccessEditor(
  {
    employee,
    orgId,
    orgName,
    managementDepartments,
    directoryPerson,
    pendingInvitation,
    onClose,
    onCompleted,
    onDirtyChange,
    hideActions = false,
  }: EmployeeManagementAccessEditorProps,
  ref,
) {
  const isInSandbox = useIsInSandbox();
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<AssignableOrganizationRole>(
    pendingInvitation?.roleToAssign ?? (directoryPerson?.orgRole === "admin" ? "admin" : "user"),
  );
  const [managementDepartmentIds, setManagementDepartmentIds] = useState<number[]>(
    pendingInvitation?.departmentIds ?? directoryPerson?.managementDepartmentIds ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchOrganizationUsers(orgId)
      .then((users) => {
        if (!cancelled) setOrgUsers(users);
      })
      .catch(() => {
        if (!cancelled) setOrgUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const linkedUser = useMemo(
    () => (employee.userId ? (orgUsers.find((user) => user.id === employee.userId) ?? null) : null),
    [employee.userId, orgUsers],
  );

  // With account linking removed, the only path that can resolve to an
  // existing org user is when the employee row already has a user_id. We
  // intentionally don't surface an "email-matches-another-user" sidecar
  // anymore — that path silently rewrote someone else's membership.
  const matchedUser = linkedUser;
  // Whether something already holds a role for this person: a membership, a
  // linked account, or a pending invitation. If so, the role is changed where
  // that thing is shown, never from here. directoryPerson.orgRole and
  // pendingInvitation are props, present on first render; matchedUser depends
  // on fetchOrganizationUsers resolving, so gating on it alone let the picker
  // flash in before that fetch finished.
  const hasKnownOrgRole =
    Boolean(directoryPerson?.orgRole) || Boolean(matchedUser) || Boolean(pendingInvitation);
  // Same flash, different symptom: employee.userId is known synchronously
  // and, for a linked employee, always ends up resolving to a matchedUser
  // once fetchOrganizationUsers settles - so copy that reads the eventual
  // outcome can use it immediately instead of guessing "invite" first.
  const isLinkedUser = Boolean(employee.userId);
  useEffect(() => {
    if (matchedUser?.orgRole === "admin" || matchedUser?.orgRole === "user") {
      setRole(matchedUser.orgRole);
    }
  }, [matchedUser?.id, matchedUser?.orgRole]);

  const effectiveEmail = linkedUser?.email || employee.email || pendingInvitation?.email || "";
  const baseRole: AssignableOrganizationRole =
    linkedUser?.orgRole === "admin" || linkedUser?.orgRole === "user"
      ? linkedUser.orgRole
      : (pendingInvitation?.roleToAssign ??
        (directoryPerson?.orgRole === "admin" ? "admin" : "user"));
  const baseManagementDepartmentIds =
    pendingInvitation?.departmentIds ?? directoryPerson?.managementDepartmentIds ?? [];
  const hasUnsavedChanges =
    JSON.stringify({
      role,
      managementDepartmentIds: [...managementDepartmentIds].sort((left, right) => left - right),
    }) !==
    JSON.stringify({
      role: baseRole,
      managementDepartmentIds: [...baseManagementDepartmentIds].sort((left, right) => left - right),
    });
  const hasExistingManagementAccess =
    (pendingInvitation?.departmentIds?.length ?? 0) > 0 ||
    (directoryPerson?.managementDepartmentIds.length ?? 0) > 0;
  // Clearing departments on a pending invite means revoking it, not
  // resending it for zero departments — that branch doesn't need a valid
  // email to submit, since nothing is being sent.
  const isRevokeOnSave =
    !matchedUser && !!pendingInvitation && managementDepartmentIds.length === 0;
  type InviteSaveAction = "create" | "update" | "revoke";
  const inviteSaveAction: InviteSaveAction | null = matchedUser
    ? null
    : isRevokeOnSave
      ? "revoke"
      : !pendingInvitation
        ? "create"
        : "update";
  const canSubmit =
    !isInSandbox &&
    !loadingUsers &&
    (matchedUser !== null || isRevokeOnSave || effectiveEmail.trim().length > 0) &&
    (managementDepartmentIds.length > 0 || hasExistingManagementAccess) &&
    !saving &&
    hasUnsavedChanges;
  const isEditingExistingAccess =
    (directoryPerson?.managementDepartmentIds.length ?? 0) > 0 || !!pendingInvitation;
  const isCreating = !isEditingExistingAccess;
  const dismissLabel = getEditorDismissLabel({ hasUnsavedChanges, isCreating });
  const submitLabel = isLinkedUser
    ? "Save Access"
    : inviteSaveAction === "revoke"
      ? "Revoke Invitation"
      : inviteSaveAction === "update"
        ? "Save Invitation"
        : "Send Invitation";
  // Only ever a consequence of saving. The "select at least one" case is a
  // missing answer, and stays as the field's own error under the tags.
  const accessNotices =
    hasExistingManagementAccess && managementDepartmentIds.length === 0
      ? [
          isRevokeOnSave
            ? "Saving now revokes the pending invitation."
            : "Saving now removes their management access. They'll stay on the schedule.",
        ]
      : [];
  const discardChanges = useCallback(() => {
    setRole(baseRole);
    setManagementDepartmentIds([...baseManagementDepartmentIds]);
  }, [baseRole, baseManagementDepartmentIds]);

  const handleDismissClick = useCallback(() => {
    if (!isCreating && hasUnsavedChanges) {
      discardChanges();
      return;
    }
    onClose();
  }, [isCreating, hasUnsavedChanges, discardChanges, onClose]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  function toggleDepartment(departmentId: number) {
    setManagementDepartmentIds((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId],
    );
  }

  async function sendInviteEmail(token: string, targetEmail: string) {
    const response = await fetch("/api/send-invite-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: targetEmail, orgName }),
    });
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      try {
        const parsed = JSON.parse(body) as { error?: string };
        throw new Error(
          formatClientErrorMessage(parsed.error, "We couldn't send the invitation email."),
        );
      } catch {
        throw new Error("We couldn't send the invitation email.");
      }
    }
  }

  async function applyMatchedUserAccess(): Promise<Employee | null> {
    // matchedUser only fires when employee.userId is already set (linkedUser)
    // — account linking has been removed, so we no longer link a new user to
    // an unlinked employees row from this surface. The remaining work is to
    // sync role + management departments on the existing membership.
    if (!matchedUser) return null;

    const updatedEmployee: Employee | null = null;

    if (pendingInvitation) {
      if (!pendingInvitation.updatedAt) {
        throw new Error("Invitation data is out of date. Refresh and try again.");
      }
      await revokeOrganizationInvitationGuarded({
        orgId,
        invitationId: pendingInvitation.id,
        expectedUpdatedAt: pendingInvitation.updatedAt,
      });
    }
    if (matchedUser.orgRole !== role && matchedUser.orgRole !== "super_admin") {
      if (!matchedUser.updatedAt) {
        throw new Error("User access data is out of date. Refresh and try again.");
      }
      await updateOrganizationMembershipGuarded({
        orgId,
        userId: matchedUser.id,
        expectedUpdatedAt: matchedUser.updatedAt,
        orgRole: role,
        adminPermissions: role === "admin" ? matchedUser.adminPermissions : null,
      });
    }
    await updateAppOnlyUser(matchedUser.id, orgId, {
      departmentIds: managementDepartmentIds,
    });
    return updatedEmployee;
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    try {
      if (matchedUser) {
        const updatedEmployee = await applyMatchedUserAccess();
        toast.success("Management access updated");
        await onCompleted(updatedEmployee);
      } else if (inviteSaveAction === "revoke" && pendingInvitation) {
        if (!pendingInvitation.updatedAt) {
          throw new Error("Invitation data is out of date. Refresh and try again.");
        }
        await revokeOrganizationInvitationGuarded({
          orgId,
          invitationId: pendingInvitation.id,
          expectedUpdatedAt: pendingInvitation.updatedAt,
        });
        toast.success("Management invitation revoked");
        await onCompleted(null);
      } else if (pendingInvitation) {
        if (!pendingInvitation.updatedAt) {
          throw new Error("Invitation data is out of date. Refresh and try again.");
        }
        // The email comes from Profile details. This only updates
        // role/departments, so there is nothing to resend.
        await updateOrganizationInvitationGuarded({
          orgId,
          invitationId: pendingInvitation.id,
          expectedUpdatedAt: pendingInvitation.updatedAt,
          firstName: employee.firstName,
          lastName: employee.lastName,
          phone: employee.phone || undefined,
          email: effectiveEmail.trim(),
          roleToAssign: role,
          departmentIds: managementDepartmentIds,
        });
        toast.success("Invitation updated");
        await onCompleted(null);
      } else {
        const created = await createOrganizationInvitation({
          email: effectiveEmail.trim(),
          role,
          orgId,
          employeeId: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          phone: employee.phone || undefined,
          departmentIds: managementDepartmentIds,
        });
        await sendInviteEmail(created.token, effectiveEmail.trim());
        toast.success(`Management invitation sent to ${effectiveEmail.trim()}`);
        await onCompleted(null);
      }
      onClose();
    } catch (err) {
      if (
        err instanceof OrganizationAccessConflictError ||
        err instanceof InvitationAccessConflictError
      ) {
        toast.error("Access changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error(formatClientErrorMessage(err, "We couldn't update management access."));
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      save: handleSubmit,
      discard: handleDismissClick,
    }),
    [handleDismissClick, handleSubmit],
  );

  return (
    <>
      <section
        aria-label={isEditingExistingAccess ? "Edit management access" : "Add to management"}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {/* First thing in the editor, so in a popup it lands directly under the
            title rather than partway down the body. */}
        <SectionNotice messages={accessNotices} />

        {!hasKnownOrgRole && (
          <div>
            <label style={fieldLabelStyle}>Role</label>
            <div style={{ maxWidth: 200 }}>
              <CustomSelect
                value={role}
                options={INVITE_ROLE_OPTIONS}
                onChange={(value) => setRole(value as AssignableOrganizationRole)}
              />
            </div>
          </div>
        )}

        {!loadingUsers && !linkedUser && !effectiveEmail.trim() && (
          <FieldError message="Add an email address in Profile details before inviting them." />
        )}

        <div>
          <label style={fieldLabelStyle}>
            Management departments
            {!hasExistingManagementAccess && (
              <span style={{ color: "var(--dg-color-danger)" }}> *</span>
            )}
          </label>
          {managementDepartments.length === 0 ? (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              You don't have any management departments yet. Add one in Settings, under Departments,
              then come back to assign it here.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {managementDepartments.map((department) => (
                  <SelectableTag
                    key={department.id}
                    selected={managementDepartmentIds.includes(department.id)}
                    onClick={() => toggleDepartment(department.id)}
                    padding="5px 12px"
                  >
                    {department.name}
                  </SelectableTag>
                ))}
              </div>
              {/* Only the validation half stays by the tags. The removal is a
                  consequence of the save, so it is raised once at the top of
                  the section instead. */}
              {managementDepartmentIds.length === 0 && !hasExistingManagementAccess && (
                <FieldError message="Select at least one management department" />
              )}
            </>
          )}
        </div>

        {isInSandbox && (
          <p
            style={{
              color: "var(--dg-color-info-text)",
              fontSize: "var(--dg-fs-body-sm)",
              margin: 0,
              padding: "8px 12px",
              background: "var(--dg-color-info-bg)",
              border: "1px solid var(--dg-color-info-border)",
              borderRadius: "var(--dg-radius-md)",
            }}
          >
            Granting management access isn't available in sandbox mode. Exit the sandbox to update
            access on your real organization.
          </p>
        )}

        {!hideActions && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button className="dg-btn dg-btn-secondary" onClick={handleDismissClick}>
              {dismissLabel}
            </Button>
            <Button
              className={
                inviteSaveAction === "revoke"
                  ? "dg-btn dg-btn-danger-filled"
                  : "dg-btn dg-btn-primary"
              }
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.5 }}
            >
              <ButtonLoading loading={saving} spinnerSize={16}>
                {submitLabel}
              </ButtonLoading>
            </Button>
          </div>
        )}
      </section>
    </>
  );
});

function FieldError({ message }: { message: string }) {
  return (
    <div
      style={{
        color: "var(--dg-color-danger)",
        fontSize: "var(--dg-fs-footnote)",
        marginTop: 4,
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  color: "var(--dg-type-field-title-color)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
  marginBottom: 6,
};

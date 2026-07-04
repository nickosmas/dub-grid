"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import {
  fetchOrganizationUsers,
  createOrganizationInvitation,
  resendOrganizationInvitationGuarded,
  revokeOrganizationInvitationGuarded,
  updateOrganizationInvitationGuarded,
  updateOrganizationMembershipGuarded,
  OrganizationAccessConflictError,
  InvitationAccessConflictError,
  updateAppOnlyUser,
} from "@/features/organization/client";
import { useIsInSandbox } from "@/hooks";
import { usePermissions } from "@/features/permissions/client";
import { validateEmail } from "@/components/FormField";
import { toast } from "sonner";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { formatClientErrorMessage } from "@/lib/client-facing";
import type {
  AssignableOrganizationRole,
  Department,
  DirectoryPerson,
  Employee,
  Invitation,
  OrganizationUser,
} from "@/types";

interface EmployeeManagementAccessModalProps {
  employee: Employee;
  orgId: string;
  orgName: string;
  managementDepartments: Department[];
  directoryPerson?: DirectoryPerson | null;
  pendingInvitation?: Invitation;
  onClose: () => void;
  onCompleted: (updatedEmployee?: Employee | null) => void | Promise<void>;
}

const ROLE_OPTIONS: { value: AssignableOrganizationRole; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

export function EmployeeManagementAccessModal({
  employee,
  orgId,
  orgName,
  managementDepartments,
  directoryPerson,
  pendingInvitation,
  onClose,
  onCompleted,
}: EmployeeManagementAccessModalProps) {
  const isInSandbox = useIsInSandbox();
  const { isSuperAdmin, isGridmaster } = usePermissions();
  const canAssignSuperAdmin = isSuperAdmin || isGridmaster;
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(employee.email || pendingInvitation?.email || "");
  const [role, setRole] = useState<AssignableOrganizationRole>(
    pendingInvitation?.roleToAssign
      ?? (directoryPerson?.orgRole === "admin" ? "admin" : "user"),
  );
  const [managementDepartmentIds, setManagementDepartmentIds] = useState<number[]>(
    pendingInvitation?.departmentIds
      ?? directoryPerson?.managementDepartmentIds
      ?? [],
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
    () => (employee.userId ? orgUsers.find((user) => user.id === employee.userId) ?? null : null),
    [employee.userId, orgUsers],
  );

  // With account linking removed, the only path that can resolve to an
  // existing org user is when the employee row already has a user_id. We
  // intentionally don't surface an "email-matches-another-user" sidecar
  // anymore — that path silently rewrote someone else's membership.
  const matchedUser = linkedUser;
  useEffect(() => {
    if (matchedUser?.orgRole === "admin" || matchedUser?.orgRole === "user") {
      setRole(matchedUser.orgRole);
    }
  }, [matchedUser?.id, matchedUser?.orgRole]);

  const roleOptions = useMemo(() => {
    if (matchedUser?.orgRole === "super_admin") {
      return [{ value: "super_admin" as const, label: "Super Admin" }];
    }
    // Only surface Super Admin for the invitation path. The matched-user branch
    // updates an existing membership in place and is outside the invite scope.
    if (!matchedUser && canAssignSuperAdmin) {
      return [
        ...ROLE_OPTIONS,
        { value: "super_admin" as const, label: "Super Admin" },
      ];
    }
    return ROLE_OPTIONS;
  }, [matchedUser, canAssignSuperAdmin]);

  const effectiveEmail = linkedUser?.email ?? email;
  const baseRole: AssignableOrganizationRole =
    linkedUser?.orgRole === "admin" || linkedUser?.orgRole === "user"
      ? linkedUser.orgRole
      : pendingInvitation?.roleToAssign
        ?? (directoryPerson?.orgRole === "admin" ? "admin" : "user");
  const baseManagementDepartmentIds =
    pendingInvitation?.departmentIds
    ?? directoryPerson?.managementDepartmentIds
    ?? [];
  const hasUnsavedChanges =
    JSON.stringify({
      email,
      role,
      managementDepartmentIds: [...managementDepartmentIds].sort((left, right) => left - right),
    }) !== JSON.stringify({
      email: employee.email || pendingInvitation?.email || "",
      role: baseRole,
      managementDepartmentIds: [...baseManagementDepartmentIds].sort((left, right) => left - right),
    });
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = useCallback(() => {
    if (!saving && requestClose()) {
      onClose();
    }
  }, [onClose, requestClose, saving]);

  const hasExistingManagementAccess =
    (pendingInvitation?.departmentIds?.length ?? 0) > 0
    || (directoryPerson?.managementDepartmentIds.length ?? 0) > 0;
  const emailError = !effectiveEmail.trim() ? "Email address is required" : validateEmail(effectiveEmail);
  const canSubmit =
    !isInSandbox &&
    !loadingUsers &&
    !emailError &&
    (managementDepartmentIds.length > 0 || hasExistingManagementAccess) &&
    !saving;
  const isEditingExistingAccess =
    (directoryPerson?.managementDepartmentIds.length ?? 0) > 0
    || !!pendingInvitation;

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
        throw new Error(formatClientErrorMessage(parsed.error, "We couldn't send the invitation email."));
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
      } else {
        let token: string;
        if (pendingInvitation) {
          if (!pendingInvitation.updatedAt) {
            throw new Error("Invitation data is out of date. Refresh and try again.");
          }
          const updatedInvitation = await updateOrganizationInvitationGuarded({
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
          const resent = await resendOrganizationInvitationGuarded({
            orgId,
            invitationId: updatedInvitation.id,
            expectedUpdatedAt: updatedInvitation.updatedAt ?? pendingInvitation.updatedAt,
          });
          token = resent.token;
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
          token = created.token;
        }
        await sendInviteEmail(token, effectiveEmail.trim());
        toast.success(`Management invitation sent to ${effectiveEmail.trim()}`);
        await onCompleted(null);
      }
      onClose();
    } catch (err) {
      if (err instanceof OrganizationAccessConflictError || err instanceof InvitationAccessConflictError) {
        toast.error("Access changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error(formatClientErrorMessage(err, "We couldn't update management access."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        title={isEditingExistingAccess ? "Edit Management Access" : "Add to Management"}
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 560, width: "100%" }}
      >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={fieldLabelStyle}>Login email</label>
          <input
            className="dg-input"
            type="email"
            value={effectiveEmail}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!linkedUser}
            style={emailError ? { borderColor: "var(--color-danger)" } : undefined}
          />
          {linkedUser && (
            <div style={{ marginTop: 4, fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
              This employee is already linked to an org member. Their login email is managed on that account.
            </div>
          )}
          {emailError && <FieldError message={emailError} />}
        </div>

        <div style={{ maxWidth: 220 }}>
          <label style={fieldLabelStyle}>Role</label>
          <CustomSelect
            value={matchedUser?.orgRole === "super_admin" ? "super_admin" : role}
            options={roleOptions}
            onChange={(value) => setRole(value as AssignableOrganizationRole)}
            disabled={matchedUser?.orgRole === "super_admin"}
          />
        </div>

        <div>
          <label style={fieldLabelStyle}>
            Management departments
            {!hasExistingManagementAccess && <span style={{ color: "var(--color-danger)" }}> *</span>}
          </label>
          {managementDepartments.length === 0 ? (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
              }}
            >
              You don't have any management departments yet. Add one in Settings,
              under Departments, then come back to assign it here.
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
                    unselectedBackground="var(--color-bg-secondary)"
                    unselectedBorderColor="transparent"
                    unselectedTextColor="var(--color-text-faint)"
                  >
                    {department.name}
                  </SelectableTag>
                ))}
              </div>
              {managementDepartmentIds.length === 0 && !hasExistingManagementAccess && (
                <FieldError message="Select at least one management department" />
              )}
            </>
          )}
          {managementDepartmentIds.length === 0 && hasExistingManagementAccess && (
            <div
              style={{
                marginTop: 6,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
              }}
            >
              Saving now removes their management access. They'll stay on the schedule.
            </div>
          )}
        </div>

        {isInSandbox && (
          <p
            style={{
              color: "var(--color-info-text)",
              fontSize: "var(--dg-fs-body-sm)",
              margin: 0,
              padding: "8px 12px",
              background: "var(--color-info-bg)",
              border: "1px solid var(--color-info-border)",
              borderRadius: "var(--dg-radius-md)",
            }}
          >
            Granting management access isn't available in sandbox mode. Exit the
            sandbox to update access on your real organization.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="dg-btn dg-btn-ghost" onClick={handleRequestClose}>
            {EDITOR_ACTION_LABELS.close}
          </button>
          {hasExistingManagementAccess && managementDepartmentIds.length > 0 && (
            <button
              className="dg-btn dg-btn-ghost"
              onClick={() => setManagementDepartmentIds([])}
              style={{ color: "var(--color-danger)" }}
            >
              Remove from Management
            </button>
          )}
          <button
            className="dg-btn dg-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ opacity: canSubmit ? 1 : 0.5 }}
          >
            <ButtonLoading loading={saving} spinnerSize={16}>
              Save Access
            </ButtonLoading>
          </button>
        </div>
      </div>
      </Modal>
      {unsavedChangesDialog}
    </>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <div
      style={{
        color: "var(--color-danger)",
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
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

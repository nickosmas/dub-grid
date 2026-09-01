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
import {
  checkEmployeeEmailConflict,
  EmployeeContactConflictError,
  type EmployeeEmailConflictResult,
  updateEmployeeIdentity,
} from "@/features/employees/client";
import { useIsInSandbox } from "@/hooks";
import { validateEmail } from "@/components/FormField";
import { toast } from "sonner";
import { getEditorDismissLabel } from "@/components/ui/editor-action-labels";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { AccessStatusRow } from "@/components/staff/AccessStatusRow";
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

/**
 * In-place editor shared by the staff slide-over and detail page. Role changes
 * deliberately live in MemberAccessControls, so this editor owns only
 * management departments and the invitation/access plumbing around them.
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
  const [email, setEmail] = useState(employee.email || pendingInvitation?.email || "");
  const [role, setRole] = useState<AssignableOrganizationRole>(
    pendingInvitation?.roleToAssign ?? (directoryPerson?.orgRole === "admin" ? "admin" : "user"),
  );
  const [managementDepartmentIds, setManagementDepartmentIds] = useState<number[]>(
    pendingInvitation?.departmentIds ?? directoryPerson?.managementDepartmentIds ?? [],
  );
  const [employeeEmailConflict, setEmployeeEmailConflict] = useState(false);
  const [employeeEmailConflictReason, setEmployeeEmailConflictReason] =
    useState<EmployeeEmailConflictResult["reason"]>(undefined);

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
  useEffect(() => {
    if (matchedUser?.orgRole === "admin" || matchedUser?.orgRole === "user") {
      setRole(matchedUser.orgRole);
    }
  }, [matchedUser?.id, matchedUser?.orgRole]);

  const effectiveEmail = linkedUser?.email ?? email;
  const baseRole: AssignableOrganizationRole =
    linkedUser?.orgRole === "admin" || linkedUser?.orgRole === "user"
      ? linkedUser.orgRole
      : (pendingInvitation?.roleToAssign ??
        (directoryPerson?.orgRole === "admin" ? "admin" : "user"));
  const baseManagementDepartmentIds =
    pendingInvitation?.departmentIds ?? directoryPerson?.managementDepartmentIds ?? [];
  const hasUnsavedChanges =
    JSON.stringify({
      email,
      role,
      managementDepartmentIds: [...managementDepartmentIds].sort((left, right) => left - right),
    }) !==
    JSON.stringify({
      email: employee.email || pendingInvitation?.email || "",
      role: baseRole,
      managementDepartmentIds: [...baseManagementDepartmentIds].sort((left, right) => left - right),
    });
  const hasExistingManagementAccess =
    (pendingInvitation?.departmentIds?.length ?? 0) > 0 ||
    (directoryPerson?.managementDepartmentIds.length ?? 0) > 0;
  const emailError = !effectiveEmail.trim()
    ? "Email address is required"
    : validateEmail(effectiveEmail);

  // employees.email is the single source of truth for this person's
  // login/invite email. The field here is only ever freely editable for a
  // genuinely first-time invite: no linked account, no contact email on
  // file yet, and no invitation already locked in. Once any of those
  // exist, the address is fixed here — change it in Staff details (which
  // backfills employees.email) or via Revoke + Reinvite for a live invite.
  const emailReadOnly = !!linkedUser || !!employee.email || !!pendingInvitation;

  // Only meaningful when this save would backfill employees.email (see
  // maybeBackfillEmail below) — the roster contact email is currently
  // blank and about to be set from this field. Flags a collision with a
  // DIFFERENT active employee's contact email before Save is pressed,
  // instead of only surfacing it via a swallowed backfill failure.
  useEffect(() => {
    if (emailReadOnly || emailError) {
      setEmployeeEmailConflict(false);
      setEmployeeEmailConflictReason(undefined);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      checkEmployeeEmailConflict(effectiveEmail.trim(), orgId, employee.id, employee.userId)
        .then((result) => {
          if (!cancelled) {
            setEmployeeEmailConflict(result.conflict);
            setEmployeeEmailConflictReason(result.reason);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("checkEmployeeEmailConflict failed", err);
            setEmployeeEmailConflict(false);
            setEmployeeEmailConflictReason(undefined);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [emailReadOnly, employee.id, emailError, effectiveEmail, orgId]);

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
    (isRevokeOnSave || (!emailError && !employeeEmailConflict)) &&
    (managementDepartmentIds.length > 0 || hasExistingManagementAccess) &&
    !saving &&
    hasUnsavedChanges;
  const isEditingExistingAccess =
    (directoryPerson?.managementDepartmentIds.length ?? 0) > 0 || !!pendingInvitation;
  const isCreating = !isEditingExistingAccess;
  const dismissLabel = getEditorDismissLabel({ hasUnsavedChanges, isCreating });
  const submitLabel = matchedUser
    ? "Save Access"
    : inviteSaveAction === "revoke"
      ? "Revoke Invitation"
      : inviteSaveAction === "update"
        ? "Save Invitation"
        : "Send Invitation";
  const discardChanges = useCallback(() => {
    setEmail(employee.email || pendingInvitation?.email || "");
    setRole(baseRole);
    setManagementDepartmentIds([...baseManagementDepartmentIds]);
  }, [employee.email, pendingInvitation?.email, baseRole, baseManagementDepartmentIds]);

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

  // Only safe to call when no live pending invitation for this employee
  // survives the save (i.e. none exists yet, or it was just revoked) — a DB
  // trigger (trg_revoke_invitation_on_email_change) auto-revokes any live
  // pending invitation the instant employees.email changes, so backfilling
  // here while one is meant to stay alive would kill it out from under the
  // save that's supposed to keep it.
  async function maybeBackfillEmail(): Promise<Employee | null> {
    const trimmed = effectiveEmail.trim();
    if (employee.email || !trimmed || validateEmail(trimmed)) return null;
    try {
      const { employee: updated } = await updateEmployeeIdentity({
        employeeId: employee.id,
        orgId,
        userId: employee.userId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone || "",
        email: trimmed,
        expectedVersion: employee.version,
      });
      return updated;
    } catch (err) {
      // Non-blocking — the invite action itself already succeeded, so a
      // failed backfill must never throw out of this helper. A stale
      // version conflict just means someone else edited this employee
      // moments ago; stay silent. But an actionable contact conflict (this
      // email already belongs to someone else) is worth surfacing, since
      // it's exactly why the employee's email field stayed blank.
      if (err instanceof EmployeeContactConflictError) {
        toast.error(
          "That email is already used by another person, so it wasn't saved to this employee's profile.",
        );
      }
      return null;
    }
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
        const updatedEmployee = await maybeBackfillEmail();
        toast.success("Management invitation revoked");
        await onCompleted(updatedEmployee);
      } else if (pendingInvitation) {
        if (!pendingInvitation.updatedAt) {
          throw new Error("Invitation data is out of date. Refresh and try again.");
        }
        // Email is locked while a pending invitation exists (see
        // emailReadOnly above) — this only ever updates role/departments,
        // never the target address, so there's nothing to resend.
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
        const backfilledEmployee = await maybeBackfillEmail();
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
        await onCompleted(backfilledEmployee);
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
        <AccessStatusRow
          label="Management access"
          statusText={
            managementDepartmentIds.length > 0
              ? `Active — ${managementDepartmentIds.length} department${
                  managementDepartmentIds.length === 1 ? "" : "s"
                }`
              : "No management access"
          }
          tone={managementDepartmentIds.length > 0 ? "active" : "neutral"}
          note={
            managementDepartmentIds.length === 0 && hasExistingManagementAccess
              ? isRevokeOnSave
                ? "Saving now revokes the pending invitation."
                : "Saving now removes their management access. They'll stay on the schedule."
              : undefined
          }
          actionLabel={
            hasExistingManagementAccess && managementDepartmentIds.length > 0
              ? "Remove from Management"
              : undefined
          }
          onAction={
            hasExistingManagementAccess && managementDepartmentIds.length > 0
              ? () => setManagementDepartmentIds([])
              : undefined
          }
        />

        <div>
          <label style={fieldLabelStyle}>Login email</label>
          <input
            className="dg-input"
            type="email"
            value={effectiveEmail}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailReadOnly}
            style={emailError ? { borderColor: "var(--dg-color-danger)" } : undefined}
          />
          {linkedUser && (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              This employee is already linked to an org member. Their login email is managed on that
              account.
            </div>
          )}
          {!linkedUser && pendingInvitation && (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              An invitation is already pending at this address. Revoke it to invite a different one.
            </div>
          )}
          {!linkedUser && !pendingInvitation && employee.email && (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              This is their contact email from Staff details. Change it there to update their invite
              address.
            </div>
          )}
          {!emailReadOnly && !emailError && !employeeEmailConflict && (
            <div
              style={{
                marginTop: 4,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
              }}
            >
              Saving emails an invitation link to this address.
            </div>
          )}
          {emailError && <FieldError message={emailError} />}
          {!emailError && employeeEmailConflict && (
            <FieldError
              message={
                employeeEmailConflictReason === "gridmaster"
                  ? "That email address is reserved."
                  : "That email is already used by another person on your team."
              }
            />
          )}
        </div>

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
                    unselectedBackground="var(--dg-color-bg-secondary)"
                    unselectedBorderColor="transparent"
                    unselectedTextColor="var(--dg-color-text-faint)"
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
            <Button className="dg-btn dg-btn-ghost" onClick={handleDismissClick}>
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

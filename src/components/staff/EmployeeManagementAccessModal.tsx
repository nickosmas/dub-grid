"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import {
  fetchOrganizationUsers,
  linkEmployeeToUser,
  reconcileEmployeeNameAndLinkUser,
  sendInvitation,
  resendOrganizationInvitationGuarded,
  revokeOrganizationInvitationGuarded,
  updateOrganizationInvitationGuarded,
  updateOrganizationMembershipGuarded,
  OrganizationAccessConflictError,
  InvitationAccessConflictError,
  updateAppOnlyUser,
} from "@/lib/db";
import { NameMismatchError } from "@/lib/account-linking";
import { AccountNameMismatchPanel } from "@/components/AccountNameMismatchPanel";
import { validateEmail } from "@/components/FormField";
import { toast } from "sonner";
import { ExplainerSection, WorkflowStrip } from "@/components/ui/explainer-section";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import type {
  AssignableOrganizationRole,
  Department,
  DirectoryPerson,
  Employee,
  Invitation,
  NameMismatchDetails,
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
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(employee.email || pendingInvitation?.email || "");
  const [role, setRole] = useState<AssignableOrganizationRole>(
    pendingInvitation?.roleToAssign
      ?? (directoryPerson?.orgRole === "admin" ? "admin" : "user"),
  );
  const [nameMismatch, setNameMismatch] = useState<NameMismatchDetails | null>(null);
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

  const emailMatch = useMemo(() => {
    if (linkedUser || !email.trim()) return null;
    const normalized = email.trim().toLowerCase();
    return orgUsers.find((user) => user.email?.toLowerCase() === normalized) ?? null;
  }, [email, linkedUser, orgUsers]);

  const matchedUser = linkedUser ?? emailMatch;
  useEffect(() => {
    if (matchedUser?.orgRole === "admin" || matchedUser?.orgRole === "user") {
      setRole(matchedUser.orgRole);
    }
  }, [matchedUser?.id, matchedUser?.orgRole]);

  const roleOptions = useMemo(() => {
    if (matchedUser?.orgRole === "super_admin") {
      return [{ value: "super_admin" as const, label: "Super Admin" }];
    }
    return ROLE_OPTIONS;
  }, [matchedUser?.orgRole]);

  const effectiveEmail = linkedUser?.email ?? email;
  useEffect(() => {
    setNameMismatch(null);
  }, [employee.id, effectiveEmail, matchedUser?.id]);
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
        throw new Error(parsed.error || "Failed to send invitation email");
      } catch {
        throw new Error("Failed to send invitation email");
      }
    }
  }

  async function applyMatchedUserAccess(reconcileName: boolean): Promise<Employee | null> {
    if (!matchedUser) return null;

    let updatedEmployee: Employee | null = null;

    if (!employee.userId) {
      if (reconcileName) {
        await reconcileEmployeeNameAndLinkUser(employee.id, matchedUser.id, orgId);
      } else {
        await linkEmployeeToUser(employee.id, matchedUser.id, orgId);
      }
      updatedEmployee = {
        ...employee,
        firstName: reconcileName && nameMismatch ? nameMismatch.accountFirstName : employee.firstName,
        lastName: reconcileName && nameMismatch ? nameMismatch.accountLastName : employee.lastName,
        userId: matchedUser.id,
      };
    }
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
        const updatedEmployee = await applyMatchedUserAccess(false);
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
          const created = await sendInvitation(
            effectiveEmail.trim(),
            role,
            orgId,
            employee.id,
            {
              firstName: employee.firstName,
              lastName: employee.lastName,
              phone: employee.phone || undefined,
              departmentIds: managementDepartmentIds,
            },
          );
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
      if (err instanceof NameMismatchError && matchedUser && !employee.userId) {
        setNameMismatch(err.details);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update management access");
    } finally {
      setSaving(false);
    }
  }

  async function handleReconcileLink() {
    if (!matchedUser || !nameMismatch) return;

    setSaving(true);
    try {
      const updatedEmployee = await applyMatchedUserAccess(true);
      toast.success("Management access updated");
      await onCompleted(updatedEmployee);
      onClose();
    } catch (err) {
      if (err instanceof OrganizationAccessConflictError || err instanceof InvitationAccessConflictError) {
        toast.error("Access changed elsewhere. Review the latest values and try again.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to update management access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        title={isEditingExistingAccess ? "Edit Management Access" : "Grant Management Access"}
        onClose={onClose}
        onRequestClose={() => !saving && requestClose()}
        style={{ maxWidth: 560, width: "100%" }}
      >
      {nameMismatch ? (
        <AccountNameMismatchPanel
          details={nameMismatch}
          title="Name mismatch found"
          description="This employee record does not match the existing org member name. If the account name is correct, you can update the employee record to match it and continue granting management access."
          confirmLabel="Use Account Name and Link"
          dismissLabel={EDITOR_ACTION_LABELS.close}
          onCancel={handleRequestClose}
          onConfirm={handleReconcileLink}
          confirming={saving}
        />
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ExplainerSection
          title="How management access works"
          compact
          defaultOpen={false}
          storageKey="dg-explainer-management-access"
          points={[
            {
              title: "The employee record stays separate from the login",
              description: "You can grant management access without changing the employee's scheduled departments, focus areas, or schedule status.",
            },
            {
              title: "Org role controls app-level access",
              description: "Role determines whether the linked account is a regular user or an admin inside the organization.",
            },
            {
              title: "Management departments live on the membership or invite",
              description: "These departments organize management access and roster membership. They do not rewrite the employee record itself.",
            },
          ]}
          preview={(
            <WorkflowStrip
              compact
              steps={[
                {
                  label: "Employee record",
                  description: "Scheduled identity and staffing details",
                  tone: "default",
                },
                {
                  label: "Linked login",
                  description: "Email-based account access",
                  tone: "info",
                },
                {
                  label: "Org role + management departments",
                  description: "Permissions and management roster membership",
                  tone: "success",
                },
              ]}
            />
          )}
        />

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
          {!linkedUser && emailMatch && (
            <div style={{ marginTop: 4, fontSize: "var(--dg-fs-footnote)", color: "var(--color-info-text)" }}>
              Existing org member found for this email. Submitting will link the employee instead of sending a new invite.
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
          {managementDepartmentIds.length === 0 && hasExistingManagementAccess && (
            <div
              style={{
                marginTop: 6,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
              }}
            >
              Saving now will remove this person from the Management roster and keep them on the schedule.
            </div>
          )}
        </div>

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
      )}
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

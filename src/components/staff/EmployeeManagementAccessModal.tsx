"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import {
  changeOrganizationUserRole,
  fetchOrganizationUsers,
  linkEmployeeToUser,
  resendInvitation,
  revokeInvitation,
  sendInvitation,
  updateAppOnlyUser,
  updatePendingInvitation,
} from "@/lib/db";
import { validateEmail } from "@/components/FormField";
import { toast } from "sonner";
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
  onCompleted: () => void;
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
  const emailError = !effectiveEmail.trim() ? "Email address is required" : validateEmail(effectiveEmail);
  const canSubmit =
    !loadingUsers &&
    !emailError &&
    managementDepartmentIds.length > 0 &&
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

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    try {
      if (matchedUser) {
        if (!employee.userId) {
          await linkEmployeeToUser(employee.id, matchedUser.id, orgId);
        }
        if (pendingInvitation) {
          await revokeInvitation(pendingInvitation.id, orgId);
        }
        if (matchedUser.orgRole !== role && matchedUser.orgRole !== "super_admin") {
          await changeOrganizationUserRole(matchedUser.id, role, orgId, matchedUser.email ?? undefined);
        }
        await updateAppOnlyUser(matchedUser.id, orgId, {
          departmentIds: managementDepartmentIds,
        });
        toast.success("Management access updated");
      } else {
        let token: string;
        if (pendingInvitation) {
          await updatePendingInvitation(pendingInvitation.id, orgId, {
            firstName: employee.firstName,
            lastName: employee.lastName,
            phone: employee.phone || undefined,
            email: effectiveEmail.trim(),
            roleToAssign: role,
            departmentIds: managementDepartmentIds,
          });
          const resent = await resendInvitation(pendingInvitation.id, orgId);
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
      }

      onCompleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update management access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEditingExistingAccess ? "Edit Management Access" : "Grant Management Access"}
      onClose={onClose}
      style={{ maxWidth: 560, width: "100%" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "var(--color-bg-secondary)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Grant app access for management work without changing this employee&apos;s schedule status. Management departments stay on the org membership or invitation, not on the employee record.
        </div>

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
            Management departments <span style={{ color: "var(--color-danger)" }}>*</span>
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
          {managementDepartmentIds.length === 0 && (
            <FieldError message="Select at least one management department" />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="dg-btn dg-btn-ghost" onClick={onClose}>
            Cancel
          </button>
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

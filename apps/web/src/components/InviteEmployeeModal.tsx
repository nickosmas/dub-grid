"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Modal from "./Modal";
import CustomSelect from "./CustomSelect";
import { Employee, OrganizationUser, NamedItem, Department, NameMismatchDetails } from "@/types";
import type { AssignableOrganizationRole } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { validateEmail, validateRequired } from "@/components/FormField";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { NameMismatchError } from "@/lib/account-linking";
import { AccountNameMismatchPanel } from "@/components/AccountNameMismatchPanel";
import {
  fetchOrganizationUsers,
  createOrganizationInvitation,
} from "@/features/organization/client";
import {
  linkEmployeeToUser,
  reconcileEmployeeNameAndLinkUser,
} from "@/features/employees/client";

const ROLE_OPTIONS = [
  { value: "user" as const, label: "User" },
  { value: "admin" as const, label: "Admin" },
];

interface InviteEmployeeModalProps {
  /** Employee to invite. When null, operates in management staff mode (no employee link). */
  employee: Employee | null;
  orgId: string;
  orgName: string;
  onClose: () => void;
  onInvited: (updatedEmployee?: Employee | null) => void | Promise<void>;
  /** Available departments (for management staff mode). Accepts NamedItem[] or Department[]. */
  departments?: (NamedItem | Department)[];
}

type ModalMode = "loading" | "link" | "invite";

export default function InviteEmployeeModal({
  employee,
  orgId,
  orgName,
  onClose,
  onInvited,
  departments = [],
}: InviteEmployeeModalProps) {
  const isManagementInvite = !employee;
  const [email, setEmail] = useState(employee?.email || "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  const [role, setRole] = useState<AssignableOrganizationRole>("user");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [nameMismatch, setNameMismatch] = useState<NameMismatchDetails | null>(null);

  // Management departments only (filtered from all departments — only Department has .type)
  const managementDepts = useMemo(
    () => departments.filter((d): d is Department => "type" in d && d.type === "management"),
    [departments],
  );

  // Existing user detection
  const [orgUsers, setOrgUsers] = useState<OrganizationUser[]>([]);
  const [orgUsersLoaded, setOrgUsersLoaded] = useState(false);

  // On mount, fetch org users (only needed when linking an employee)
  useEffect(() => {
    if (isManagementInvite) {
      setOrgUsersLoaded(true);
      return;
    }
    fetchOrganizationUsers(orgId)
      .then((users) => {
        setOrgUsers(users);
      })
      .catch(() => {
        // fallback — leave empty
      })
      .finally(() => setOrgUsersLoaded(true));
  }, [orgId, isManagementInvite]);

  // Derive mode and matchedUser inline
  const matchedUser = !isManagementInvite && orgUsersLoaded && email.trim()
    ? orgUsers.find(
        (u) => u.email && u.email.toLowerCase() === email.trim().toLowerCase()
      ) ?? null
    : null;

  useEffect(() => {
    setNameMismatch(null);
  }, [employee?.id, email, matchedUser?.id]);

  const mode: ModalMode = !orgUsersLoaded
    ? "loading"
    : matchedUser
      ? "link"
      : "invite";
  const initialDraftSnapshot = useMemo(
    () =>
      JSON.stringify({
        email: employee?.email || "",
        firstName: "",
        lastName: "",
        phone: "",
        departmentIds: [] as number[],
        role: "user",
      }),
    [employee?.email],
  );
  const hasUnsavedChanges =
    JSON.stringify({
      email,
      firstName,
      lastName,
      phone,
      departmentIds: [...departmentIds].sort((left, right) => left - right),
      role,
    }) !== initialDraftSnapshot;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = useCallback(() => {
    if (!sending && requestClose()) {
      onClose();
    }
  }, [onClose, requestClose, sending]);
  const trimmedEmail = email.trim();
  const requiredEmailError = trimmedEmail ? validateEmail(trimmedEmail) : "Email address is required";
  const canSend =
    !requiredEmailError &&
    (!isManagementInvite || (!!firstName.trim() && !!lastName.trim())) &&
    (!isManagementInvite || managementDepts.length === 0 || departmentIds.length > 0) &&
    !sending &&
    !sent;

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const fieldErrors = useMemo(
    () => ({
      firstName:
        isManagementInvite && touched.firstName
          ? validateRequired(firstName, "First name")
          : null,
      lastName:
        isManagementInvite && touched.lastName
          ? validateRequired(lastName, "Last name")
          : null,
      email: touched.email ? requiredEmailError : null,
      departmentIds:
        isManagementInvite && managementDepts.length > 0 && touched.departmentIds && departmentIds.length === 0
          ? "Select at least one management department"
          : null,
    }),
    [
      departmentIds.length,
      firstName,
      isManagementInvite,
      lastName,
      managementDepts.length,
      requiredEmailError,
      touched,
    ],
  );

  async function handleLink() {
    if (!matchedUser || !employee) return;
    setSending(true);
    setError(null);

    try {
      await linkEmployeeToUser(employee.id, matchedUser.id, orgId);
      const updatedEmployee: Employee = {
        ...employee,
        userId: matchedUser.id,
      };
      toast.success(`${getEmployeeDisplayName(employee)} linked to ${matchedUser.email}`);
      await onInvited(updatedEmployee);
      onClose();
    } catch (err) {
      if (err instanceof NameMismatchError) {
        setNameMismatch(err.details);
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to link user";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleReconcileLink() {
    if (!matchedUser || !employee || !nameMismatch) return;
    setSending(true);
    setError(null);

    try {
      await reconcileEmployeeNameAndLinkUser(employee.id, matchedUser.id, orgId);
      const updatedEmployee: Employee = {
        ...employee,
        firstName: nameMismatch.accountFirstName,
        lastName: nameMismatch.accountLastName,
        userId: matchedUser.id,
      };
      toast.success(`${getEmployeeDisplayName(employee)} updated to match ${matchedUser.email} and linked`);
      await onInvited(updatedEmployee);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reconcile and link user";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!canSend) {
      setTouched((prev) => ({
        ...prev,
        email: true,
        ...(isManagementInvite
          ? { firstName: true, lastName: true, departmentIds: true }
          : {}),
      }));
      return;
    }
    setSending(true);
    setError(null);

    try {
      const { token } = await createOrganizationInvitation({
        email: trimmedEmail,
        role,
        orgId,
        employeeId: employee?.id,
        firstName: isManagementInvite ? firstName.trim() : undefined,
        lastName: isManagementInvite ? lastName.trim() : undefined,
        phone: isManagementInvite ? (phone.trim() || undefined) : undefined,
        departmentIds:
          isManagementInvite && departmentIds.length > 0
            ? departmentIds
            : undefined,
      });

      // Send the invitation email
      const res = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: trimmedEmail, orgName }),
      });
      if (!res.ok) {
        // Invitation was saved to DB but email failed — tell the user clearly
        const text = await res.text().catch(() => "");
        let detail = "Failed to send invitation email";
        try { detail = JSON.parse(text).error || detail; } catch { /* non-JSON response */ }
        throw new Error(`Invitation created but email failed: ${detail}`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to send invitation email");
      }

      toast.success(`Invitation email sent to ${trimmedEmail}`);
      setSent(true);
      await onInvited(null);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? (err as { message: string }).message
            : "Failed to create invitation";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const userName = matchedUser
    ? [matchedUser.firstName, matchedUser.lastName].filter(Boolean).join(" ") || matchedUser.email
    : null;

  return (
    <>
      <Modal
        title={isManagementInvite ? "Invite Management Staff" : mode === "link" ? `Link ${getEmployeeDisplayName(employee)}` : `Invite ${getEmployeeDisplayName(employee)}`}
        onClose={onClose}
        onRequestClose={() => !sending && requestClose()}
        style={{ maxWidth: 480 }}
      >
      {nameMismatch ? (
        <AccountNameMismatchPanel
          details={nameMismatch}
          title="Name mismatch found"
          description="This employee record does not match the existing user account name. If the account name is correct, you can update the employee record to match it and complete the link."
          confirmLabel="Use Account Name and Link"
          dismissLabel={EDITOR_ACTION_LABELS.close}
          onCancel={handleRequestClose}
          onConfirm={handleReconcileLink}
          confirming={sending}
        />
      ) : mode === "loading" ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--color-text-muted, #4D6080)", fontSize: "var(--dg-fs-body-sm)" }}>
          Checking for existing users...
        </div>
      ) : mode === "link" && matchedUser ? (
        /* Direct link mode — user already exists in this org */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "16px",
              background: "var(--color-info-bg)",
              borderRadius: 8,
              border: "1px solid var(--color-info-border)",
            }}
          >
            <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-info-text)" }}>
              Existing user found
            </p>
            <p style={{ margin: "8px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-info-text)" }}>
              <strong>{userName}</strong> ({matchedUser.email}) is already a member of this
              organization as <strong>{matchedUser.orgRole.replace("_", " ")}</strong>.
              You can link them directly — no invitation needed.
            </p>
          </div>

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="dg-btn dg-btn-ghost" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleLink}
              disabled={sending}
              style={{ opacity: sending ? 0.5 : 1 }}
            >
              <ButtonLoading loading={sending} spinnerSize={16}>{`Link to ${userName}`}</ButtonLoading>
            </button>
          </div>
        </div>
      ) : (
        /* Invite mode — new user */
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Employee context */}
          <div
            style={{
              padding: "12px 16px",
              background: "var(--color-bg-hover, #F5F7FA)",
              borderRadius: 8,
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--color-text-secondary, #334766)",
            }}
          >
            {isManagementInvite
              ? "Invite management staff who need app access but won\u2019t appear on the schedule."
              : <>Sending an invitation to <strong>{getEmployeeDisplayName(employee!)}</strong>. They will receive an email with a link to set their password and join your organization.</>
            }
          </div>

          {/* Name fields (management staff mode) */}
          {isManagementInvite && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>
                  First name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched("firstName")}
                  placeholder="Jane"
                  style={
                    fieldErrors.firstName
                      ? { ...inputStyle, borderColor: "var(--color-danger)" }
                      : inputStyle
                  }
                />
                {fieldErrors.firstName && (
                  <div
                    style={{
                      color: "var(--color-danger)",
                      fontSize: "var(--dg-fs-footnote)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.firstName}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>
                  Last name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => markTouched("lastName")}
                  placeholder="Smith"
                  style={
                    fieldErrors.lastName
                      ? { ...inputStyle, borderColor: "var(--color-danger)" }
                      : inputStyle
                  }
                />
                {fieldErrors.lastName && (
                  <div
                    style={{
                      color: "var(--color-danger)",
                      fontSize: "var(--dg-fs-footnote)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.lastName}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label style={labelStyle}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => markTouched("email")}
              placeholder="employee@example.com"
              style={
                fieldErrors.email
                  ? { ...inputStyle, borderColor: "var(--color-danger)" }
                  : inputStyle
              }
            />
            {fieldErrors.email && (
              <div
                style={{
                  color: "var(--color-danger)",
                  fontSize: "var(--dg-fs-footnote)",
                  marginTop: 4,
                }}
                role="alert"
              >
                {fieldErrors.email}
              </div>
            )}
          </div>

          {/* Phone (management staff mode, optional) */}
          {isManagementInvite && (
            <div>
              <label style={labelStyle}>Phone <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(optional)</span></label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555-123-4567"
                style={inputStyle}
              />
            </div>
          )}

          {/* Management departments */}
          {isManagementInvite && managementDepts.length > 0 && (
            <div>
              <label style={labelStyle}>
                Management departments{" "}
                <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {managementDepts.map((department) => (
                  <SelectableTag
                    key={department.id}
                    selected={departmentIds.includes(department.id)}
                    onClick={() => {
                      setDepartmentIds((prev) =>
                        prev.includes(department.id)
                          ? prev.filter((id) => id !== department.id)
                          : [...prev, department.id],
                      );
                      markTouched("departmentIds");
                    }}
                    padding="5px 12px"
                    unselectedBackground="var(--color-bg-secondary)"
                    unselectedBorderColor="transparent"
                    unselectedTextColor="var(--color-text-faint)"
                  >
                    {department.name}
                  </SelectableTag>
                ))}
              </div>
              {fieldErrors.departmentIds && (
                <div
                  style={{
                    color: "var(--color-danger)",
                    fontSize: "var(--dg-fs-footnote)",
                    marginTop: 4,
                  }}
                  role="alert"
                >
                  {fieldErrors.departmentIds}
                </div>
              )}
            </div>
          )}

          {/* Role */}
          <div style={{ maxWidth: 200 }}>
            <label style={labelStyle}>Role</label>
            <CustomSelect
              value={role}
              options={ROLE_OPTIONS}
              onChange={(v) => setRole(v as AssignableOrganizationRole)}
            />
          </div>

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="dg-btn dg-btn-ghost" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </button>
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleSend}
              disabled={!canSend}
              style={{ opacity: canSend ? 1 : 0.5 }}
            >
              <ButtonLoading loading={sending} spinnerSize={16}>Send Invitation</ButtonLoading>
            </button>
          </div>
        </div>
      )}
      </Modal>
      {unsavedChangesDialog}
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      style={{
        color: "var(--color-danger-dark)",
        fontSize: "var(--dg-fs-body-sm)",
        margin: 0,
        padding: "8px 12px",
        background: "var(--color-danger-bg)",
        borderRadius: "var(--dg-radius-md)",
      }}
    >
      {message}
    </p>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 600,
  color: "var(--color-text-secondary, #334766)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--color-border, #C8D6EC)",
  borderRadius: "var(--dg-btn-radius)",
  fontSize: "var(--dg-fs-body-sm)",
  color: "var(--color-text-primary, #0F1724)",
  background: "var(--color-bg, #fff)",
  outline: "none",
  boxSizing: "border-box",
};

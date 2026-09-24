"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Modal from "./Modal";
import CustomSelect from "./CustomSelect";
import { Employee, NamedItem, Department, Invitation } from "@/types";
import { Button } from "@/components/Button";
import type { AssignableOrganizationRole } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { validateEmail, validatePhone, validateRequired } from "@/components/FormField";
import { normalizeOptionalUsPhone } from "@dubgrid/contracts";
import { toast } from "sonner";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import {
  createOrganizationInvitation,
  checkUserExistsByEmail,
  type UserExistsByEmailResult,
} from "@/features/organization/client";
import { checkEmployeePhoneConflict } from "@/features/employees/client";
import { useIsInSandbox } from "@/hooks";
import { usePermissions } from "@/features/permissions/client";

const ROLE_OPTIONS = [
  { value: "user" as const, label: "User" },
  { value: "admin" as const, label: "Admin" },
];

const SUPER_ADMIN_OPTION = {
  value: "super_admin" as const,
  label: "Super Admin",
};

interface InviteEmployeeModalProps {
  /** Employee to invite. When null, operates in management staff mode (no employee link). */
  employee: Employee | null;
  orgId: string;
  orgName: string;
  onClose: () => void;
  onInvited: (updatedEmployee?: Employee | null) => void | Promise<void>;
  /** Available departments (for management staff mode). Accepts NamedItem[] or Department[]. */
  departments?: (NamedItem | Department)[];
  /** Retained for callers that reopen the modal from a pending-invitation
   *  banner. The target address still comes only from Profile details. */
  pendingInvitation?: Invitation;
}

export default function InviteEmployeeModal({
  employee,
  orgId,
  orgName,
  onClose,
  onInvited,
  departments = [],
}: InviteEmployeeModalProps) {
  const isManagementInvite = !employee;
  const isInSandbox = useIsInSandbox();
  const { isSuperAdmin, isGridmaster } = usePermissions();
  const roleOptions = useMemo(
    () => (isSuperAdmin || isGridmaster ? [...ROLE_OPTIONS, SUPER_ADMIN_OPTION] : ROLE_OPTIONS),
    [isSuperAdmin, isGridmaster],
  );
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
  const [emailLookup, setEmailLookup] = useState<UserExistsByEmailResult | null>(null);
  const [emailLookupLoading, setEmailLookupLoading] = useState(false);
  const [employeePhoneConflict, setEmployeePhoneConflict] = useState(false);

  // Management departments only (filtered from all departments — only Department has .type)
  const managementDepts = useMemo(
    () => departments.filter((d): d is Department => "type" in d && d.type === "management"),
    [departments],
  );

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
  const trimmedEmail = (isManagementInvite ? email : employee?.email || "").trim();
  const requiredEmailError = trimmedEmail
    ? validateEmail(trimmedEmail)
    : "Email address is required";

  // Pre-flight: when the email is a valid format, check whether it already
  // maps to a DubGrid user (any org). Debounced to avoid spamming the
  // endpoint on every keystroke. Three outcomes drive the UI:
  //   - existsInThisOrg → block submission (red banner; admin should open
  //     the existing record instead).
  //   - exists && !existsInThisOrg → info banner (cross-org reuse); admin
  //     can still send the invite. Note that the roster will show the
  //     existing user's profile name after they accept.
  //   - !exists → no banner; standard new-user invitation.
  useEffect(() => {
    if (!isManagementInvite || requiredEmailError) {
      setEmailLookup(null);
      setEmailLookupLoading(false);
      return;
    }
    let cancelled = false;
    setEmailLookupLoading(true);
    const timer = setTimeout(() => {
      checkUserExistsByEmail(trimmedEmail, orgId)
        .then((result) => {
          if (!cancelled) setEmailLookup(result);
        })
        .catch(() => {
          // Soft fail — pre-flight is advisory; the DB trigger still
          // enforces correctness on submit.
          if (!cancelled) setEmailLookup(null);
        })
        .finally(() => {
          if (!cancelled) setEmailLookupLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isManagementInvite, trimmedEmail, requiredEmailError, orgId]);

  // Management-only invites create a brand-new employees row on accept
  // (accept_invitation() in 002_functions_triggers.sql), so a phone number
  // typed here that collides with a different active employee's phone
  // won't fail until that far-later accept step. Flag it now instead.
  const phoneFormatError = validatePhone(phone);
  useEffect(() => {
    if (!isManagementInvite || !phone.trim() || phoneFormatError) {
      setEmployeePhoneConflict(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      checkEmployeePhoneConflict(phone, orgId)
        .then((result) => {
          if (!cancelled) setEmployeePhoneConflict(result.conflict);
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("checkEmployeePhoneConflict failed", err);
            setEmployeePhoneConflict(false);
          }
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isManagementInvite, phone, phoneFormatError, orgId]);

  const canSend =
    !isInSandbox &&
    !requiredEmailError &&
    !emailLookup?.existsInThisOrg &&
    !employeePhoneConflict &&
    (!isManagementInvite || (!!firstName.trim() && !!lastName.trim())) &&
    (!isManagementInvite || managementDepts.length === 0 || departmentIds.length > 0) &&
    (!isManagementInvite || !validatePhone(phone)) &&
    !sending &&
    !sent;

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const fieldErrors = useMemo(
    () => ({
      firstName:
        isManagementInvite && touched.firstName ? validateRequired(firstName, "First name") : null,
      lastName:
        isManagementInvite && touched.lastName ? validateRequired(lastName, "Last name") : null,
      email: isManagementInvite && touched.email ? requiredEmailError : null,
      phone: isManagementInvite && touched.phone ? validatePhone(phone) : null,
      departmentIds:
        isManagementInvite &&
        managementDepts.length > 0 &&
        touched.departmentIds &&
        departmentIds.length === 0
          ? "Select at least one management department"
          : null,
    }),
    [
      departmentIds.length,
      firstName,
      isManagementInvite,
      lastName,
      managementDepts.length,
      phone,
      requiredEmailError,
      touched,
    ],
  );

  async function handleSend() {
    if (!canSend) {
      setTouched((prev) => ({
        ...prev,
        ...(isManagementInvite ? { email: true } : {}),
        ...(isManagementInvite ? { firstName: true, lastName: true, departmentIds: true } : {}),
        ...(isManagementInvite ? { phone: true } : {}),
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
        phone: isManagementInvite ? normalizeOptionalUsPhone(phone) || undefined : undefined,
        departmentIds: isManagementInvite && departmentIds.length > 0 ? departmentIds : undefined,
      });

      // Send the invitation email
      const res = await fetch("/api/send-invite-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: trimmedEmail, orgName }),
      });
      if (!res.ok) {
        // Invitation was saved to DB but email failed — tell the user clearly.
        // The detail is a whole sentence from the server, so it follows ours
        // rather than being spliced into it ("created, but We couldn't...").
        const text = await res.text().catch(() => "");
        let detail = "We couldn't send the invitation email.";
        try {
          detail = formatClientErrorMessage(
            JSON.parse(text).error,
            "We couldn't send the invitation email.",
          );
        } catch {
          /* non-JSON response */
        }
        throw new Error(`The invitation is saved. ${detail}`);
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(
          formatClientErrorMessage(data.error, "We couldn't send the invitation email."),
        );
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
            : "We couldn't send that invitation. Try again.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Modal
        title={
          isManagementInvite
            ? "Invite Management Staff"
            : `Invite ${getEmployeeDisplayName(employee)}`
        }
        onClose={onClose}
        onRequestClose={() => !sending && requestClose()}
        style={{ maxWidth: 480 }}
      >
        {/* Single-state: invite-only. accept_invitation handles whether the
            recipient already has an account elsewhere (cross-org case) or
            needs a fresh signup. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Employee context */}
          <div
            style={{
              padding: "12px 16px",
              background: "var(--dg-color-bg-secondary)",
              borderRadius: "var(--dg-radius-md)",
              fontSize: "var(--dg-fs-body-sm)",
              color: "var(--dg-color-text-secondary)",
            }}
          >
            {isManagementInvite ? (
              "Invite management staff who need app access but won\u2019t appear on the schedule."
            ) : (
              <>
                Sending an invitation to <strong>{getEmployeeDisplayName(employee!)}</strong>. They
                will receive an email with a link to set their password and join your organization.
              </>
            )}
          </div>

          {/* Name fields (management staff mode) */}
          {isManagementInvite && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>
                  First name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched("firstName")}
                  placeholder="Jane"
                  style={
                    fieldErrors.firstName
                      ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                      : inputStyle
                  }
                />
                {fieldErrors.firstName && (
                  <div
                    style={{
                      color: "var(--dg-color-danger)",
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
                  Last name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => markTouched("lastName")}
                  placeholder="Smith"
                  style={
                    fieldErrors.lastName
                      ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                      : inputStyle
                  }
                />
                {fieldErrors.lastName && (
                  <div
                    style={{
                      color: "var(--dg-color-danger)",
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

          {isManagementInvite ? (
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
                    ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                    : inputStyle
                }
              />
              {fieldErrors.email && (
                <div
                  style={{
                    color: "var(--dg-color-danger)",
                    fontSize: "var(--dg-fs-footnote)",
                    marginTop: 4,
                  }}
                  role="alert"
                >
                  {fieldErrors.email}
                </div>
              )}
              {!fieldErrors.email && !emailLookupLoading && emailLookup?.existsInThisOrg && (
                <div
                  role="alert"
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    borderRadius: "var(--dg-radius-sm)",
                    background: "var(--dg-color-danger-bg)",
                    color: "var(--dg-color-danger-text)",
                    fontSize: "var(--dg-fs-footnote)",
                  }}
                >
                  <strong>{emailLookup.displayName ?? trimmedEmail}</strong> is already on your
                  team. Find them in the People list to update their record instead of inviting
                  again.
                </div>
              )}
              {!fieldErrors.email &&
                !emailLookupLoading &&
                emailLookup?.exists &&
                !emailLookup.existsInThisOrg && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      borderRadius: "var(--dg-radius-sm)",
                      background: "var(--dg-color-info-bg)",
                      color: "var(--dg-color-info-text)",
                      fontSize: "var(--dg-fs-footnote)",
                    }}
                  >
                    <strong>{emailLookup.displayName ?? trimmedEmail}</strong> already has a DubGrid
                    account. They&apos;ll join your organization when they accept the invite
                    {emailLookup.displayName ? (
                      <>
                        {", and your roster will show their name as "}
                        <strong>{emailLookup.displayName}</strong>.
                      </>
                    ) : (
                      <>.</>
                    )}
                  </div>
                )}
            </div>
          ) : !trimmedEmail ? (
            <div
              role="alert"
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-danger)",
              }}
            >
              Add an email address in Profile details before sending an invitation.
            </div>
          ) : null}

          {/* Phone (management staff mode, optional) */}
          {isManagementInvite && (
            <div>
              <label style={labelStyle}>
                Phone{" "}
                <span style={{ fontWeight: 400, color: "var(--dg-color-text-muted)" }}>
                  (optional)
                </span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => {
                  markTouched("phone");
                  if (!validatePhone(phone)) {
                    setPhone(normalizeOptionalUsPhone(phone));
                  }
                }}
                placeholder="+1 555-123-4567"
                style={
                  fieldErrors.phone
                    ? { ...inputStyle, borderColor: "var(--dg-color-danger)" }
                    : inputStyle
                }
              />
              {fieldErrors.phone && (
                <div
                  style={{
                    color: "var(--dg-color-danger)",
                    fontSize: "var(--dg-fs-footnote)",
                    marginTop: 4,
                  }}
                  role="alert"
                >
                  {fieldErrors.phone}
                </div>
              )}
              {!fieldErrors.phone && employeePhoneConflict && (
                <div
                  style={{
                    color: "var(--dg-color-danger)",
                    fontSize: "var(--dg-fs-footnote)",
                    marginTop: 4,
                  }}
                  role="alert"
                >
                  That phone number is already used by another person on your team.
                </div>
              )}
            </div>
          )}

          {/* Management departments */}
          {isManagementInvite && managementDepts.length > 0 && (
            <div>
              <label style={labelStyle}>
                Management departments <span style={{ color: "var(--dg-color-danger)" }}>*</span>
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
                  >
                    {department.name}
                  </SelectableTag>
                ))}
              </div>
              {fieldErrors.departmentIds && (
                <div
                  style={{
                    color: "var(--dg-color-danger)",
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
              options={roleOptions}
              onChange={(v) => setRole(v as AssignableOrganizationRole)}
            />
          </div>

          {/* Sandbox notice */}
          {isInSandbox && (
            <SandboxNotice message="Sending invitations isn't available in sandbox mode. Exit the sandbox to invite people to your real organization." />
          )}

          {/* Error */}
          {error && <ErrorBanner message={error} />}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <Button className="dg-btn dg-btn-secondary" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </Button>
            <Button
              className="dg-btn dg-btn-primary"
              onClick={handleSend}
              disabled={!canSend}
              style={{ opacity: canSend ? 1 : 0.5 }}
            >
              <ButtonLoading loading={sending} spinnerSize={16}>
                Send Invitation
              </ButtonLoading>
            </Button>
          </div>
        </div>
      </Modal>
      {unsavedChangesDialog}
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      style={{
        color: "var(--dg-color-danger-dark)",
        fontSize: "var(--dg-fs-body-sm)",
        margin: 0,
        padding: "8px 12px",
        background: "var(--dg-color-danger-bg)",
        borderRadius: "var(--dg-radius-md)",
      }}
    >
      {message}
    </p>
  );
}

function SandboxNotice({ message }: { message: string }) {
  return (
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
      {message}
    </p>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  color: "var(--dg-type-field-title-color)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--dg-color-border, #C8D6EC)",
  borderRadius: "var(--dg-btn-radius)",
  fontSize: "var(--dg-fs-body-sm)",
  color: "var(--dg-color-text-primary)",
  background: "var(--dg-color-surface)",
  outline: "none",
  boxSizing: "border-box",
};

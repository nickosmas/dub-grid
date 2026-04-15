"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { validateEmail, validatePhone, validateRequired } from "@/components/FormField";
import { MaybeHint } from "@/components/ui/hint";
import { SelectableTag } from "@/components/ui/selectable-tag";

export interface EditEmployeePanelProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  certificationLabel?: string;
  roles: NamedItem[];
  roleLabel?: string;
  focusAreaLabel?: string;
  departments?: NamedItem[];
  departmentLabel?: string;
  onSave: (updatedEmployee: Employee) => void;
  onCancel: () => void;
  onInvite?: (emp: Employee) => void;
  pendingInvitation?: Invitation;
  onRevoke?: (invitationId: string) => Promise<boolean> | boolean | void;
}

type EditForm = {
  firstName: string;
  lastName: string;
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
  phone: string;
  email: string;
  contactNotes: string;
};

export default function EditEmployeePanel({
  employee,
  focusAreas,
  certifications,
  certificationLabel = "Certification",
  roles,
  roleLabel = "Roles",
  focusAreaLabel = "Focus Areas",
  onSave,
  onCancel,
  onInvite,
  pendingInvitation,
  onRevoke,
}: EditEmployeePanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const [form, setForm] = useState<EditForm>({
    firstName: employee.firstName,
    lastName: employee.lastName,
    certificationId: employee.certificationId,
    focusAreaIds: employee.focusAreaIds,
    roleIds: employee.roleIds,
    departmentIds: employee.departmentIds,
    phone: employee.phone,
    email: employee.email,
    contactNotes: employee.contactNotes,
  });

  const [revoking, setRevoking] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const fieldErrors = useMemo(
    () => ({
      firstName: touched.firstName ? validateRequired(form.firstName, "First name") : null,
      lastName: touched.lastName ? validateRequired(form.lastName, "Last name") : null,
      focusAreaIds:
        touched.focusAreaIds && form.focusAreaIds.length === 0
          ? `At least one ${focusAreaLabel.toLowerCase()} is required`
          : null,
      email: touched.email ? validateEmail(form.email) : null,
      phone: touched.phone ? validatePhone(form.phone) : null,
    }),
    [form, touched, focusAreaLabel],
  );

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  useEffect(() => {
    setForm({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      certificationId: employee.certificationId ?? null,
      focusAreaIds: employee.focusAreaIds || [],
      roleIds: employee.roleIds || [],
      departmentIds: employee.departmentIds || [],
      phone: employee.phone || "",
      email: employee.email || "",
      contactNotes: employee.contactNotes || "",
    });
    setRevoking(false);
    setTouched({});
  }, [employee]);

  const isModified = useMemo(() => {
    return (
      (form.firstName || "") !== (employee.firstName || "") ||
      (form.lastName || "") !== (employee.lastName || "") ||
      form.certificationId !== employee.certificationId ||
      (form.phone || "") !== (employee.phone || "") ||
      (form.email || "") !== (employee.email || "") ||
      (form.contactNotes || "") !== (employee.contactNotes || "") ||
      form.focusAreaIds.length !== employee.focusAreaIds.length ||
      form.focusAreaIds.some((id) => !employee.focusAreaIds.includes(id)) ||
      form.roleIds.length !== employee.roleIds.length ||
      form.roleIds.some((id) => !employee.roleIds.includes(id)) ||
      form.departmentIds.length !== employee.departmentIds.length ||
      form.departmentIds.some((id) => !employee.departmentIds.includes(id))
    );
  }, [form, employee]);

  const handleSave = useCallback(() => {
    if (!form.firstName.trim() || !form.lastName.trim() || form.focusAreaIds.length === 0) {
      setTouched({
        firstName: true,
        lastName: true,
        focusAreaIds: true,
        email: true,
        phone: true,
      });
      return;
    }
    if (validateEmail(form.email) || validatePhone(form.phone)) {
      setTouched({
        firstName: true,
        lastName: true,
        focusAreaIds: true,
        email: true,
        phone: true,
      });
      return;
    }
    onSave({
      ...employee,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      certificationId: form.certificationId,
      focusAreaIds: form.focusAreaIds,
      roleIds: form.roleIds,
      departmentIds: form.departmentIds,
      phone: form.phone.trim(),
      email: form.email.trim(),
      contactNotes: form.contactNotes.trim(),
    });
  }, [form, employee, onSave]);

  const toggleRole = useCallback(
    (roleId: number) =>
      setForm((p) => ({
        ...p,
        roleIds: p.roleIds.includes(roleId)
          ? p.roleIds.filter((id) => id !== roleId)
          : [...p.roleIds, roleId],
      })),
    [],
  );

  const toggleFocusArea = useCallback(
    (focusAreaId: number) =>
      setForm((p) => ({
        ...p,
        focusAreaIds: p.focusAreaIds.includes(focusAreaId)
          ? p.focusAreaIds.filter((id) => id !== focusAreaId)
          : [...p.focusAreaIds, focusAreaId],
      })),
    [],
  );

  const sectionLabel: React.CSSProperties = {
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    letterSpacing: "0.04em",
    display: "block",
    marginBottom: 8,
    textTransform: "uppercase",
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: "var(--dg-fs-caption)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    display: "block",
    marginBottom: 4,
  };

  const canEdit = employee.status === "active" || employee.status === "benched";
  const readOnly = !canEdit;

  return (
    <div style={{ padding: isMobile ? "16px 16px 24px" : "0 24px 28px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          ...(readOnly ? { opacity: 0.5, pointerEvents: "none" } : {}),
        }}
      >
        {/* ── Details section ── */}
        <div style={{ paddingTop: isMobile ? 0 : 20, paddingBottom: 20 }}>
          <div style={sectionLabel}>Details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label style={fieldLabel}>
                  First name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  className="dg-input"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                  onBlur={() => markTouched("firstName")}
                  placeholder="e.g. Maria"
                  readOnly={readOnly}
                  style={
                    fieldErrors.firstName
                      ? { borderColor: "var(--color-danger)" }
                      : undefined
                  }
                />
                {fieldErrors.firstName && (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-danger)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.firstName}
                  </div>
                )}
              </div>
              <div>
                <label style={fieldLabel}>
                  Last name{" "}
                  <span style={{ color: "var(--color-danger)" }}>*</span>
                </label>
                <input
                  className="dg-input"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                  onBlur={() => markTouched("lastName")}
                  placeholder="e.g. Garcia"
                  readOnly={readOnly}
                  style={
                    fieldErrors.lastName
                      ? { borderColor: "var(--color-danger)" }
                      : undefined
                  }
                />
                {fieldErrors.lastName && (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-danger)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.lastName}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label style={fieldLabel}>Phone</label>
                <input
                  className="dg-input"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  onBlur={() => markTouched("phone")}
                  placeholder="(415) 555-0100"
                  readOnly={readOnly}
                  style={
                    fieldErrors.phone
                      ? { borderColor: "var(--color-danger)" }
                      : undefined
                  }
                />
                {fieldErrors.phone && (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-danger)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.phone}
                  </div>
                )}
              </div>
              <div>
                <label style={fieldLabel}>Email</label>
                <input
                  className="dg-input"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  onBlur={() => markTouched("email")}
                  placeholder="name@example.com"
                  readOnly={readOnly}
                  style={
                    fieldErrors.email
                      ? { borderColor: "var(--color-danger)" }
                      : undefined
                  }
                />
                {employee.userId && form.email !== employee.email && (
                  <p
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-warning)",
                      margin: "4px 0 0",
                      lineHeight: 1.3,
                    }}
                  >
                    Changing the contact email does not change their login
                    email.
                  </p>
                )}
                {fieldErrors.email && (
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-danger)",
                      marginTop: 4,
                    }}
                    role="alert"
                  >
                    {fieldErrors.email}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={fieldLabel}>Internal notes</label>
              <textarea
                className="dg-input"
                value={form.contactNotes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, contactNotes: e.target.value }))
                }
                placeholder="Preferences, availability, etc."
                rows={2}
                style={{
                  resize: "vertical",
                  minHeight: 64,
                }}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>

        {/* ── Assignments section ── */}
        <div
          style={{
            borderTop: "1px solid var(--color-border-light)",
            paddingTop: 20,
            paddingBottom: 20,
          }}
        >
          <div style={sectionLabel}>Assignments</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={fieldLabel}>{certificationLabel}</label>
              <CustomSelect
                value={
                  form.certificationId != null
                    ? String(form.certificationId)
                    : ""
                }
                options={[
                  { value: "", label: "— None —" },
                  ...certifications.map((d) => ({
                    value: String(d.id),
                    label: d.name !== d.abbr ? `${d.name} (${d.abbr})` : d.name,
                  })),
                ]}
                onChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    certificationId: v ? Number(v) : null,
                  }))
                }
                disabled={readOnly}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={fieldLabel}>
                {focusAreaLabel}{" "}
                <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {focusAreas.map((focusArea) => {
                  const active = form.focusAreaIds.includes(focusArea.id);
                  return (
                    <SelectableTag
                      key={focusArea.id}
                      selected={active}
                      onClick={() => {
                        toggleFocusArea(focusArea.id);
                        markTouched("focusAreaIds");
                      }}
                      disabled={readOnly}
                      padding="5px 12px"
                      unselectedBackground="var(--color-bg-secondary)"
                      unselectedBorderColor="transparent"
                      unselectedTextColor="var(--color-text-faint)"
                    >
                      {focusArea.name}
                    </SelectableTag>
                  );
                })}
              </div>
              {fieldErrors.focusAreaIds && (
                <div
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--color-danger)",
                    marginTop: 4,
                  }}
                  role="alert"
                >
                  {fieldErrors.focusAreaIds}
                </div>
              )}
            </div>

            <div>
              <label style={fieldLabel}>{roleLabel}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {roles.map((role) => {
                  const active = form.roleIds.includes(role.id);
                  return (
                    <MaybeHint
                      key={role.id}
                      content={role.name !== role.abbr ? role.name : undefined}
                      side="top"
                    >
                      <SelectableTag
                        selected={active}
                        onClick={() => toggleRole(role.id)}
                        disabled={readOnly}
                        padding="5px 12px"
                        unselectedBackground="var(--color-bg-secondary)"
                        unselectedBorderColor="transparent"
                        unselectedTextColor="var(--color-text-faint)"
                      >
                        {role.abbr}
                      </SelectableTag>
                    </MaybeHint>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Invite status ── */}
      {canEdit &&
        !employee.userId &&
        employee.email &&
        (pendingInvitation || onInvite) && (
          <div
            style={{
              borderTop: "1px solid var(--color-border-light)",
              paddingTop: 16,
              paddingBottom: 4,
            }}
          >
            {pendingInvitation ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning-border)",
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-warning-text)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        color: "var(--color-warning-text)",
                      }}
                    >
                      Invitation pending
                    </div>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--color-warning-text)",
                        marginTop: 1,
                      }}
                    >
                      Sent to {pendingInvitation.email}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {onInvite && (
                    <button
                      disabled={revoking}
                      onClick={async () => {
                        if (onRevoke) {
                          setRevoking(true);
                          try {
                            const result = await onRevoke(pendingInvitation.id);
                            if (result === false) return;
                          } finally {
                            setRevoking(false);
                          }
                        }
                        onInvite(employee);
                      }}
                      className="dg-btn dg-btn-ghost"
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        padding: "4px 8px",
                        color: "var(--color-link)",
                      }}
                    >
                      <ButtonLoading loading={revoking} spinnerSize={12}>
                        Reinvite
                      </ButtonLoading>
                    </button>
                  )}
                  {onRevoke && (
                    <button
                      disabled={revoking}
                      onClick={async () => {
                        setRevoking(true);
                        try {
                          await onRevoke(pendingInvitation.id);
                        } finally {
                          setRevoking(false);
                        }
                      }}
                      className="dg-btn dg-btn-ghost"
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        padding: "4px 8px",
                        color: "var(--color-danger)",
                      }}
                    >
                      <ButtonLoading loading={revoking} spinnerSize={12}>
                        Revoke
                      </ButtonLoading>
                    </button>
                  )}
                </div>
              </div>
            ) : onInvite ? (
              <button
                onClick={() => onInvite(employee)}
                className="dg-btn dg-btn-ghost"
                style={{
                  color: "var(--color-link)",
                  fontSize: "var(--dg-fs-caption)",
                  padding: "6px 10px",
                  width: "100%",
                  justifyContent: "center",
                  border: "1px dashed var(--color-brand-border)",
                  borderRadius: 10,
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                Send Invitation
              </button>
            ) : null}
          </div>
        )}

      {/* ── Actions ── */}
      <div
        style={{
          paddingTop: 16,
          borderTop: "1px solid var(--color-border-light)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Primary actions */}
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={
                !isModified ||
                !form.firstName.trim() ||
                !form.lastName.trim() ||
                form.focusAreaIds.length === 0
              }
              className="dg-btn dg-btn-primary"
              style={{ flex: 1 }}
            >
              Save Changes
            </button>
            <button
              onClick={onCancel}
              className="dg-btn dg-btn-secondary"
              style={{ flex: 1 }}
            >
              {isModified ? "Discard" : "Close"}
            </button>
          </div>
        )}
        {!canEdit && (
          <button
            onClick={onCancel}
            className="dg-btn dg-btn-secondary"
            style={{ width: "100%" }}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

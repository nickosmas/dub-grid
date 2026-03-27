"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";
import { ButtonLoading } from "@/components/ButtonSpinner";

export interface EditEmployeePanelProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  certificationLabel?: string;
  roles: NamedItem[];
  roleLabel?: string;
  focusAreaLabel?: string;
  onSave: (updatedEmployee: Employee) => void;
  onDelete: (empId: string) => void;
  onBench: (empId: string, note?: string) => void;
  onActivate: (empId: string) => void;
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
  onDelete,
  onBench,
  onActivate,
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
    phone: employee.phone,
    email: employee.email,
    contactNotes: employee.contactNotes,
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBenchConfirm, setShowBenchConfirm] = useState(false);
  const [benchNote, setBenchNote] = useState(employee.statusNote || "");
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    setForm({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      certificationId: employee.certificationId ?? null,
      focusAreaIds: employee.focusAreaIds || [],
      roleIds: employee.roleIds || [],
      phone: employee.phone || "",
      email: employee.email || "",
      contactNotes: employee.contactNotes || "",
    });
    setBenchNote(employee.statusNote || "");
    setShowDeleteConfirm(false);
    setShowBenchConfirm(false);
    setRevoking(false);
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
      form.roleIds.some((id) => !employee.roleIds.includes(id))
    );
  }, [form, employee]);

  const handleSave = useCallback(() => {
    if (!form.firstName.trim()) return;
    if (form.focusAreaIds.length === 0) return;
    onSave({
      ...employee,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      certificationId: form.certificationId,
      focusAreaIds: form.focusAreaIds,
      roleIds: form.roleIds,
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

  const isActive = employee.status === "active";
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
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <label style={fieldLabel}>First name</label>
                <input
                  className="dg-input"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                  placeholder="e.g. Maria"
                  readOnly={readOnly}
                />
              </div>
              <div>
                <label style={fieldLabel}>Last name</label>
                <input
                  className="dg-input"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                  placeholder="e.g. Garcia"
                  readOnly={readOnly}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <label style={fieldLabel}>Phone</label>
                <input
                  className="dg-input"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="(415) 555-0100"
                  readOnly={readOnly}
                />
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
                  placeholder="name@example.com"
                  readOnly={readOnly}
                />
                {employee.userId && form.email !== employee.email && (
                  <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-warning)", margin: "4px 0 0", lineHeight: 1.3 }}>
                    Changing the contact email does not change their login email.
                  </p>
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
        <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 20, paddingBottom: 20 }}>
          <div style={sectionLabel}>Assignments</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={fieldLabel}>{certificationLabel}</label>
              <CustomSelect
                value={form.certificationId != null ? String(form.certificationId) : ""}
                options={[
                  { value: "", label: "— None —" },
                  ...certifications.map((d) => ({ value: String(d.id), label: d.name !== d.abbr ? `${d.name} (${d.abbr})` : d.name })),
                ]}
                onChange={(v) => setForm((p) => ({ ...p, certificationId: v ? Number(v) : null }))}
                disabled={readOnly}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={fieldLabel}>{focusAreaLabel}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {focusAreas.map((focusArea) => {
                  const active = form.focusAreaIds.includes(focusArea.id);
                  return (
                    <button
                      key={focusArea.id}
                      onClick={() => toggleFocusArea(focusArea.id)}
                      disabled={readOnly}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: active
                          ? "var(--color-brand)"
                          : "var(--color-bg-secondary)",
                        color: active
                          ? "var(--color-text-inverse)"
                          : "var(--color-text-faint)",
                        border: active
                          ? "1.5px solid transparent"
                          : "1.5px solid transparent",
                        borderRadius: 8,
                        padding: "5px 12px",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        cursor: readOnly ? "default" : "pointer",
                        transition: "all 150ms ease",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: focusArea.colorBg, flexShrink: 0, border: active ? "1px solid rgba(255,255,255,0.3)" : "none" }} />
                      {focusArea.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={fieldLabel}>{roleLabel}</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {roles.map((role) => {
                  const active = form.roleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      onClick={() => toggleRole(role.id)}
                      disabled={readOnly}
                      title={role.name !== role.abbr ? role.name : undefined}
                      style={{
                        background: active
                          ? "var(--color-brand)"
                          : "var(--color-bg-secondary)",
                        color: active ? "var(--color-text-inverse)" : "var(--color-text-faint)",
                        border: active
                          ? "1.5px solid transparent"
                          : "1.5px solid transparent",
                        borderRadius: 8,
                        padding: "5px 12px",
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        cursor: readOnly ? "default" : "pointer",
                        transition: "all 150ms ease",
                        fontFamily: "inherit",
                      }}
                    >
                      {role.abbr}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Invite status ── */}
      {canEdit && !employee.userId && employee.email && (pendingInvitation || onInvite) && (
        <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 16, paddingBottom: 4 }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-warning-text)" }}>Invitation pending</div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-warning-text)", marginTop: 1 }}>
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
                    style={{ fontSize: "var(--dg-fs-footnote)", padding: "4px 8px", color: "var(--color-link)" }}
                  >
                    <ButtonLoading loading={revoking} spinnerSize={12}>Reinvite</ButtonLoading>
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
                    style={{ fontSize: "var(--dg-fs-footnote)", padding: "4px 8px", color: "var(--color-danger)" }}
                  >
                    <ButtonLoading loading={revoking} spinnerSize={12}>Revoke</ButtonLoading>
                  </button>
                )}
              </div>
            </div>
          ) : onInvite ? (
            <button
              onClick={() => onInvite(employee)}
              className="dg-btn dg-btn-ghost"
              style={{ color: "var(--color-link)", fontSize: "var(--dg-fs-caption)", padding: "6px 10px", width: "100%", justifyContent: "center", border: "1px dashed var(--color-brand-border)", borderRadius: 10 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
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
        {isActive && showBenchConfirm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-warning-bg)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-warning-border)" }}>
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-warning-text)", lineHeight: 1.4 }}>
              Bench {getEmployeeDisplayName(employee)}? They will be removed from the schedule but their data will be preserved.
            </span>
            <input
              className="dg-input"
              value={benchNote}
              onChange={(e) => setBenchNote(e.target.value)}
              placeholder="Reason (optional) — e.g. 'On leave until June'"
              style={{ fontSize: "var(--dg-fs-label)" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { onBench(employee.id, benchNote.trim() || undefined); }}
                className="dg-btn dg-btn-primary"
                style={{ background: "var(--color-warning)", border: "none", color: "var(--color-text-inverse)" }}
              >
                Confirm Bench
              </button>
              <button
                onClick={() => setShowBenchConfirm(false)}
                className="dg-btn dg-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : employee.status !== "terminated" && showDeleteConfirm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-danger-bg)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-danger-border)" }}>
            <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-danger-text)", lineHeight: 1.4 }}>
              Terminate {getEmployeeDisplayName(employee)}? They will be permanently removed from the schedule and staff list. Historical shift data will be preserved.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onDelete(employee.id)}
                className="dg-btn dg-btn-primary"
                style={{ background: "var(--color-danger)", border: "none", color: "var(--color-text-inverse)" }}
              >
                Confirm Termination
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="dg-btn dg-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Primary actions */}
            {canEdit && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={
                    !isModified || !form.firstName.trim() || form.focusAreaIds.length === 0
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
            {/* Secondary actions */}
            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 2 }}>
                {(employee.status === "benched" || employee.status === "terminated") && (
                  <button
                    onClick={() => onActivate(employee.id)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "var(--color-success)", fontSize: "var(--dg-fs-caption)", padding: "5px 10px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Activate
                  </button>
                )}
                {isActive && (
                  <button
                    onClick={() => setShowBenchConfirm(true)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "var(--color-warning)", fontSize: "var(--dg-fs-caption)", padding: "5px 10px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Bench
                  </button>
                )}
                {employee.status !== "terminated" && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "var(--color-danger)", fontSize: "var(--dg-fs-caption)", padding: "5px 10px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Terminate
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

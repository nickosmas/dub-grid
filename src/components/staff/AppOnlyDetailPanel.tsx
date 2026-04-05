"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DirectoryPerson, NamedItem } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";

interface AppOnlyDetailPanelProps {
  person: DirectoryPerson;
  departments: NamedItem[];
  departmentLabel: string;
  canManageEmployees: boolean;
  onClose: () => void;
  onSave: (data: { firstName: string; lastName: string; phone: string; departmentId: number | null }) => Promise<void>;
  onRevokeAccess?: (userId: string) => Promise<void>;
  onRevokeInvitation?: (invitationId: string) => Promise<void>;
  onResendInvitation?: (invitationId: string) => Promise<void>;
  onAddToSchedule?: (person: DirectoryPerson) => void;
}

export function AppOnlyDetailPanel({
  person,
  departments,
  departmentLabel,
  canManageEmployees,
  onClose,
  onSave,
  onRevokeAccess,
  onRevokeInvitation,
  onResendInvitation,
  onAddToSchedule,
}: AppOnlyDetailPanelProps) {
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [phone, setPhone] = useState(person.phone);
  const [deptId, setDeptId] = useState<number | null>(person.departmentId);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resending, setResending] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // Reset form when person changes
  useEffect(() => {
    setFirstName(person.firstName);
    setLastName(person.lastName);
    setPhone(person.phone);
    setDeptId(person.departmentId);
    setShowRevokeConfirm(false);
  }, [person.personId, person.firstName, person.lastName, person.phone, person.departmentId]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onCloseRef.current(); }, 200);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const isModified = firstName !== person.firstName || lastName !== person.lastName || phone !== person.phone || deptId !== person.departmentId;
  const isPending = person.source === "pending_invite";
  const isExpired = person.invitationStatus === "expired";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), departmentId: deptId });
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      if (isPending && onRevokeInvitation) {
        // person.personId is "inv:<uuid>" — extract the uuid
        await onRevokeInvitation(person.personId.replace("inv:", ""));
      } else if (person.userId && onRevokeAccess) {
        await onRevokeAccess(person.userId);
      }
      handleClose();
    } finally {
      setRevoking(false);
    }
  };

  const handleResend = async () => {
    if (!onResendInvitation) return;
    setResending(true);
    try {
      await onResendInvitation(person.personId.replace("inv:", ""));
    } finally {
      setResending(false);
    }
  };

  const dept = person.departmentId ? departments.find((d) => d.id === person.departmentId) : null;
  const initials = `${(person.firstName?.[0] ?? "").toUpperCase()}${(person.lastName?.[0] ?? "").toUpperCase() || "?"}`;

  const roleLabel = (role: string | null) => {
    switch (role) {
      case "super_admin": return "Super Admin";
      case "admin": return "Admin";
      case "user": return "User";
      default: return role ?? "—";
    }
  };

  const statusConfig = isPending
    ? isExpired
      ? { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)", label: "Expired" }
      : { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", label: "Pending" }
    : { bg: "var(--color-success-bg)", text: "var(--color-success-text)", label: "Active" };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "var(--dg-fs-label)",
    fontWeight: 600,
    color: "var(--color-text-secondary)",
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: "var(--dg-fs-body-sm)",
    color: "var(--color-text-primary)",
    background: "var(--color-surface)",
    outline: "none",
  };

  return (
    <>
      <div className={`staff-detail-overlay${closing ? " closing" : ""}`} onClick={handleClose} />
      <div className={`staff-detail-pane${closing ? " closing" : ""}`}>
        {/* Header */}
        <div className="staff-detail-header">
          <button className="staff-detail-close" onClick={handleClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Profile card */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px" }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: "50%",
                background: isPending ? "var(--color-surface)" : "var(--color-primary-bg)",
                color: isPending ? "var(--color-text-muted)" : "var(--color-primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.2 }}>
                {person.firstName || person.lastName ? `${person.firstName} ${person.lastName}`.trim() : person.email}
              </div>
              <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", marginTop: 2 }}>
                {person.email}{dept ? ` · ${dept.name}` : ""}
              </div>
            </div>
            <span
              style={{
                padding: "3px 10px", borderRadius: 999,
                fontSize: "var(--dg-fs-micro)", fontWeight: 700,
                background: statusConfig.bg, color: statusConfig.text,
                flexShrink: 0,
              }}
            >
              {statusConfig.label}
            </span>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Editable fields */}
          {canManageEmployees && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" style={inputStyle} />
              </div>

              {departments.length > 0 && (
                <div>
                  <label style={labelStyle}>{departmentLabel}</label>
                  <CustomSelect
                    value={deptId?.toString() ?? ""}
                    options={[
                      { value: "", label: "None" },
                      ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
                    ]}
                    onChange={(v) => setDeptId(v ? Number(v) : null)}
                  />
                </div>
              )}

              {/* Read-only role display */}
              <div>
                <label style={labelStyle}>Role</label>
                <div style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-muted)", background: "var(--color-bg-secondary)" }}>
                  {roleLabel(person.orgRole)}
                </div>
                <p style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-faint)", margin: "4px 0 0" }}>
                  Change roles in the User Access section.
                </p>
              </div>

              {/* Save button */}
              {isModified && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="dg-btn dg-btn-primary"
                  style={{ alignSelf: "flex-start" }}
                >
                  <ButtonLoading loading={saving} spinnerSize={16}>Save Changes</ButtonLoading>
                </button>
              )}
            </>
          )}

          {/* Read-only for non-admins */}
          {!canManageEmployees && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={labelStyle}>Email</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{person.email}</div></div>
              {person.phone && <div><label style={labelStyle}>Phone</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{person.phone}</div></div>}
              {dept && <div><label style={labelStyle}>{departmentLabel}</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{dept.name}</div></div>}
              <div><label style={labelStyle}>Role</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{roleLabel(person.orgRole)}</div></div>
            </div>
          )}

          {/* Actions section */}
          {canManageEmployees && (
            <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 16, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Add to Schedule */}
              {!isPending && person.userId && onAddToSchedule && (
                <button
                  onClick={() => onAddToSchedule(person)}
                  className="dg-btn dg-btn-secondary"
                  style={{ width: "100%" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Add to Schedule
                </button>
              )}

              {/* Resend invitation */}
              {isPending && !isExpired && onResendInvitation && (
                <button onClick={handleResend} disabled={resending} className="dg-btn dg-btn-secondary" style={{ width: "100%" }}>
                  <ButtonLoading loading={resending} spinnerSize={14}>Resend Invitation</ButtonLoading>
                </button>
              )}

              {/* Revoke */}
              {!showRevokeConfirm ? (
                <button
                  onClick={() => setShowRevokeConfirm(true)}
                  className="dg-btn dg-btn-ghost"
                  style={{ width: "100%", color: "var(--color-danger)" }}
                >
                  {isPending ? "Revoke Invitation" : "Revoke Access"}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-danger-bg)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-danger-border)" }}>
                  <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-danger-text)", lineHeight: 1.4 }}>
                    {isPending
                      ? "Revoke this invitation? The link will no longer work."
                      : `Revoke access for ${person.firstName || person.email}? They will no longer be able to use the app.`
                    }
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleRevoke} disabled={revoking} className="dg-btn dg-btn-primary" style={{ background: "var(--color-danger)", border: "none", color: "var(--color-text-inverse)" }}>
                      <ButtonLoading loading={revoking} spinnerSize={14}>Confirm</ButtonLoading>
                    </button>
                    <button onClick={() => setShowRevokeConfirm(false)} className="dg-btn dg-btn-secondary">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

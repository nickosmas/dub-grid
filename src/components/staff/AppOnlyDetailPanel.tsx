"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { DirectoryPerson, NamedItem, Department, AdminPermissions } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { unionPermissions } from "@/hooks/usePermissions";

interface AppOnlyDetailPanelProps {
  person: DirectoryPerson;
  departments: NamedItem[];
  departmentLabel: string;
  canManageEmployees: boolean;
  onClose: () => void;
  onSave: (data: { firstName: string; lastName: string; phone: string; departmentIds: number[] }) => Promise<void>;
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
  const [deptIds, setDeptIds] = useState<number[]>(person.departmentIds);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [resending, setResending] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // Reset form when person changes
  useEffect(() => {
    setFirstName(person.firstName);
    setLastName(person.lastName);
    setPhone(person.phone);
    setDeptIds(person.departmentIds);
    setShowRevokeConfirm(false);
  }, [person.personId, person.firstName, person.lastName, person.phone, person.departmentIds]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onCloseRef.current(); }, 200);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") handleClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  const isModified = firstName !== person.firstName || lastName !== person.lastName || phone !== person.phone || JSON.stringify(deptIds) !== JSON.stringify(person.departmentIds);
  const isPending = person.source === "pending_invite";
  const isEmployee = person.source === "employee";
  const isExpired = person.invitationStatus === "expired";

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), departmentIds: deptIds });
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

  const personDepts = person.departmentIds
    .map(id => departments.find(d => d.id === id))
    .filter((d): d is NonNullable<typeof d> => d != null);
  const initials = `${(person.firstName?.[0] ?? "").toUpperCase()}${(person.lastName?.[0] ?? "").toUpperCase() || "?"}`;

  // Compute department-granted permissions for display
  const deptPermissionLabels = useMemo(() => {
    const mgmtDepts = departments
      .filter((d): d is Department => "type" in d && (d as Department).type === "management")
      .filter((d) => person.departmentIds.includes(d.id) && d.permissions);
    if (mgmtDepts.length === 0) return [];
    const union = unionPermissions(mgmtDepts.map((d) => d.permissions as AdminPermissions));
    const labels: string[] = [];
    if (union.canEditShifts) labels.push("Edit Shifts");
    if (union.canPublishSchedule) labels.push("Publish Schedule");
    if (union.canApplyRecurringSchedule) labels.push("Apply Recurring Schedule");
    if (union.canApproveShiftRequests) labels.push("Approve Shift Requests");
    if (union.canEditNotes) labels.push("Edit Notes");
    if (union.canManageRecurringShifts) labels.push("Manage Recurring Shifts");
    if (union.canManageShiftSeries) labels.push("Manage Shift Series");
    if (union.canManageEmployees) labels.push("Manage Employees");
    if (union.canManageFocusAreas) labels.push("Manage Focus Areas");
    if (union.canManageShiftCodes) labels.push("Manage Shift Codes");
    if (union.canManageIndicatorTypes) labels.push("Manage Indicators");
    if (union.canManageOrgLabels) labels.push("Manage Custom Labels");
    if (union.canManageCoverageRequirements) labels.push("Manage Coverage");
    return labels;
  }, [departments, person.departmentIds]);

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
                {person.email}{personDepts.length > 0 ? ` · ${personDepts.map(d => d.name).join(", ")}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {isEmployee && (
                <span
                  style={{
                    padding: "3px 10px", borderRadius: 999,
                    fontSize: "var(--dg-fs-micro)", fontWeight: 700,
                    background: "var(--color-today-bg)", color: "var(--color-today-text)",
                  }}
                >
                  On Schedule
                </span>
              )}
              <span
                style={{
                  padding: "3px 10px", borderRadius: 999,
                  fontSize: "var(--dg-fs-micro)", fontWeight: 700,
                  background: statusConfig.bg, color: statusConfig.text,
                }}
              >
                {statusConfig.label}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Editable fields */}
          {canManageEmployees && (
            <>
              {isEmployee && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--color-today-bg)", fontSize: "var(--dg-fs-caption)", color: "var(--color-today-text)", fontWeight: 500, lineHeight: 1.5 }}>
                  This person is also on the schedule. Edit their full profile from the On Schedule tab.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} disabled={isEmployee} />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} disabled={isEmployee} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" style={inputStyle} disabled={isEmployee} />
              </div>

              {departments.length > 0 && (
                <div>
                  <label style={labelStyle}>{departmentLabel}</label>
                  <CustomSelect
                    value={deptIds.length > 0 ? deptIds[0].toString() : ""}
                    options={[
                      { value: "", label: "None" },
                      ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
                    ]}
                    onChange={(v) => setDeptIds(v ? [Number(v)] : [])}
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

              {deptPermissionLabels.length > 0 && (
                <div>
                  <label style={labelStyle}>Permissions via department</label>
                  <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                    {deptPermissionLabels.join(", ")}
                  </div>
                </div>
              )}

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
              {personDepts.length > 0 && <div><label style={labelStyle}>{departmentLabel}</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{personDepts.map(d => d.name).join(", ")}</div></div>}
              <div><label style={labelStyle}>Role</label><div style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>{roleLabel(person.orgRole)}</div></div>
              {deptPermissionLabels.length > 0 && (
                <div>
                  <label style={labelStyle}>Permissions via department</label>
                  <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", lineHeight: 1.6 }}>
                    {deptPermissionLabels.join(", ")}
                  </div>
                </div>
              )}
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

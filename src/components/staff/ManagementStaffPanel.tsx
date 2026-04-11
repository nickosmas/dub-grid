"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { DirectoryPerson, NamedItem } from "@/types";
import { getInitials, formatRelativeTime } from "@/lib/utils";
import CustomSelect from "@/components/CustomSelect";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "Member",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: "var(--color-brand-bg)", text: "var(--color-brand)" },
  admin: { bg: "var(--color-brand-bg)", text: "var(--color-brand)" },
  user: { bg: "var(--color-border-light)", text: "var(--color-text-muted)" },
};

interface ManagementStaffPanelProps {
  person: DirectoryPerson;
  departments: NamedItem[];
  departmentLabel: string;
  canManageEmployees: boolean;
  onClose: () => void;
  onSave: (data: { firstName: string; lastName: string; phone: string; departmentIds: number[] }) => Promise<void>;
  onRevokeInvitation?: (invitationId: string) => Promise<void>;
  onResendInvitation?: (invitationId: string) => Promise<void>;
  onAddToSchedule?: (person: DirectoryPerson) => void;
  onBench?: (empId: string, note?: string) => void;
  onActivate?: (empId: string) => void;
  onTerminate?: (empId: string) => void;
}

export function ManagementStaffPanel({
  person,
  departments,
  departmentLabel,
  canManageEmployees,
  onClose,
  onSave,
  onRevokeInvitation,
  onResendInvitation,
  onAddToSchedule,
  onBench,
  onActivate,
  onTerminate,
}: ManagementStaffPanelProps) {
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
    if (!isPending || !onRevokeInvitation) return;
    setRevoking(true);
    try {
      // person.personId is "inv:<uuid>" — extract the uuid
      await onRevokeInvitation(person.personId.replace("inv:", ""));
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
  const displayName = person.firstName || person.lastName
    ? `${person.firstName} ${person.lastName}`.trim()
    : person.email;
  const initials = getInitials(displayName);
  const hue = hashCode(person.personId) % 360;

  const statusConfig = isPending
    ? isExpired
      ? { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)", dot: "var(--color-danger)", label: "Expired" }
      : { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", dot: "var(--color-warning)", label: "Pending" }
    : { bg: "var(--color-success-bg)", text: "var(--color-success-text)", dot: "var(--color-success)", label: "Active" };

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

  return createPortal(
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", paddingTop: 4 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: isPending ? "var(--color-surface)" : `hsl(${hue}, 65%, 94%)`,
                color: isPending ? "var(--color-text-muted)" : `hsl(${hue}, 60%, 38%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "var(--dg-fs-body)", fontWeight: 800, flexShrink: 0,
                border: isPending ? "1px solid var(--color-border-light)" : `2px solid hsl(${hue}, 55%, 86%)`,
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: "var(--dg-fs-body)", color: "var(--color-text-primary)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </span>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {isEmployee && (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 8px", borderRadius: 20,
                        fontSize: "var(--dg-fs-footnote)", fontWeight: 600,
                        background: "var(--color-today-bg)", color: "var(--color-today-text)",
                      }}
                    >
                      On Schedule
                    </span>
                  )}
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 20,
                      fontSize: "var(--dg-fs-footnote)", fontWeight: 600,
                      background: statusConfig.bg, color: statusConfig.text,
                    }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusConfig.dot, flexShrink: 0 }} />
                    {statusConfig.label}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {person.email}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Read-only details for on-schedule employees */}
          {canManageEmployees && isEmployee && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input value={person.firstName} readOnly style={{ ...inputStyle, background: "var(--color-bg-secondary)", color: "var(--color-text-muted)", cursor: "default" }} />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={person.lastName} readOnly style={{ ...inputStyle, background: "var(--color-bg-secondary)", color: "var(--color-text-muted)", cursor: "default" }} />
                </div>
              </div>
              {person.phone && (
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={person.phone} readOnly style={{ ...inputStyle, background: "var(--color-bg-secondary)", color: "var(--color-text-muted)", cursor: "default" }} />
                </div>
              )}
              {departments.length > 0 && (
                <div>
                  <label style={labelStyle}>{departmentLabel}</label>
                  <CustomSelect
                    value={(() => { const mgmtId = deptIds.find(id => departments.some(d => d.id === id)); return mgmtId ? mgmtId.toString() : ""; })()}
                    options={[
                      { value: "", label: "None" },
                      ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
                    ]}
                    onChange={(v) => {
                      const mgmtIds = new Set(departments.map(d => d.id));
                      const kept = deptIds.filter(id => !mgmtIds.has(id));
                      setDeptIds(v ? [...kept, Number(v)] : kept);
                    }}
                  />
                </div>
              )}
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
              <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-faint)", fontStyle: "italic" }}>
                Edit other details from the on-schedule profile.
              </div>
            </>
          )}

          {/* Editable fields — only for non-employee members */}
          {canManageEmployees && !isEmployee && (
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
                    value={(() => { const mgmtId = deptIds.find(id => departments.some(d => d.id === id)); return mgmtId ? mgmtId.toString() : ""; })()}
                    options={[
                      { value: "", label: "None" },
                      ...departments.map((d) => ({ value: d.id.toString(), label: d.name })),
                    ]}
                    onChange={(v) => {
                      const mgmtIds = new Set(departments.map(d => d.id));
                      const kept = deptIds.filter(id => !mgmtIds.has(id));
                      setDeptIds(v ? [...kept, Number(v)] : kept);
                    }}
                  />
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
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Contact section */}
              <div>
                <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                  Contact
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <a
                    href={`mailto:${person.email}`}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--color-bg-secondary)", borderRadius: "var(--dg-radius-sm)", textDecoration: "none", color: "var(--color-text-secondary)", fontSize: "var(--dg-fs-body-sm)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>
                      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                    {person.email}
                  </a>
                  {person.phone && (
                    <a
                      href={`tel:${person.phone}`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--color-bg-secondary)", borderRadius: "var(--dg-radius-sm)", textDecoration: "none", color: "var(--color-text-secondary)", fontSize: "var(--dg-fs-body-sm)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      {person.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Details section */}
              {(person.orgRole || personDepts.length > 0 || (!isPending && person.lastSignInAt !== null)) && (
                <div>
                  <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-text-subtle)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                    Details
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {person.orgRole && (
                      <div>
                        <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>Role</div>
                        <span style={{
                          display: "inline-flex", padding: "3px 10px", borderRadius: 999,
                          fontSize: "var(--dg-fs-caption)", fontWeight: 600,
                          background: ROLE_COLORS[person.orgRole]?.bg ?? "var(--color-border-light)",
                          color: ROLE_COLORS[person.orgRole]?.text ?? "var(--color-text-muted)",
                        }}>
                          {ROLE_LABELS[person.orgRole] ?? person.orgRole}
                        </span>
                      </div>
                    )}

                    {personDepts.length > 0 && (
                      <div>
                        <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>{departmentLabel}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {personDepts.map(d => (
                            <span key={d.id} style={{
                              padding: "4px 10px", borderRadius: 999,
                              background: "var(--color-bg-secondary)", fontSize: "var(--dg-fs-caption)",
                              fontWeight: 500, color: "var(--color-text-secondary)",
                            }}>
                              {d.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isPending && (
                      <div>
                        <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 4 }}>Last Active</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-secondary)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                          <span title={person.lastSignInAt ? new Date(person.lastSignInAt).toLocaleString() : undefined}>
                            {person.lastSignInAt ? formatRelativeTime(person.lastSignInAt) : "Never signed in"}
                          </span>
                        </div>
                      </div>
                    )}
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

              {/* Revoke invitation (pending invites only — app access revocation is in Settings > User Management) */}
              {isPending && onRevokeInvitation && (
                !showRevokeConfirm ? (
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="dg-btn dg-btn-ghost"
                    style={{ width: "100%", color: "var(--color-danger)" }}
                  >
                    Revoke Invitation
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--color-danger-bg)", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-danger-border)" }}>
                    <span style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color: "var(--color-danger-text)", lineHeight: 1.4 }}>
                      Revoke this invitation? The link will no longer work.
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleRevoke} disabled={revoking} className="dg-btn dg-btn-primary" style={{ background: "var(--color-danger)", border: "none", color: "var(--color-text-inverse)" }}>
                        <ButtonLoading loading={revoking} spinnerSize={14}>Confirm</ButtonLoading>
                      </button>
                      <button onClick={() => setShowRevokeConfirm(false)} className="dg-btn dg-btn-secondary">Cancel</button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Sticky bottom status actions */}
        {person.employeeId && canManageEmployees && onBench && onActivate && onTerminate && (
          <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "1px solid var(--color-border-light)" }}>
            <EmployeeStatusActions
              employee={{
                id: person.employeeId,
                orgId: "",
                firstName: person.firstName,
                lastName: person.lastName,
                email: person.email,
                phone: person.phone,
                status: person.employeeStatus ?? "active",
                statusNote: "",
                statusChangedAt: null,
                userId: person.userId,
                focusAreaIds: person.focusAreaIds,
                certificationId: person.certificationId,
                roleIds: person.roleIds,
                departmentIds: person.departmentIds,
                seniority: person.seniority ?? 0,
                contactNotes: "",
                createdAt: "",
              }}
              canEdit
              onBench={onBench}
              onActivate={onActivate}
              onTerminate={onTerminate}
              variant="panel"
            />
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

"use client";

import { useState, useCallback, useMemo } from "react";
import { Employee, FocusArea, NamedItem } from "@/types";
import { getEmployeeDisplayName } from "@/lib/utils";
import CustomSelect from "@/components/CustomSelect";
import { useMediaQuery, MOBILE } from "@/hooks";

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

  const isModified = useMemo(() => {
    return (
      form.firstName !== employee.firstName ||
      form.lastName !== employee.lastName ||
      form.certificationId !== employee.certificationId ||
      form.phone !== employee.phone ||
      form.email !== employee.email ||
      form.contactNotes !== employee.contactNotes ||
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

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
  };

  const isActive = employee.status === "active";
  const canEdit = employee.status === "active" || employee.status === "benched";
  const readOnly = !canEdit;

  return (
    <div style={{ padding: isMobile ? "16px 16px" : "20px 24px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          ...(readOnly ? { opacity: 0.6, pointerEvents: "none" } : {}),
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>FIRST NAME</label>
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
              <label style={labelStyle}>LAST NAME</label>
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

          {/* Contact details */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>PHONE</label>
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
              <label style={labelStyle}>EMAIL</label>
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
                <p style={{ fontSize: 11, color: "#D97706", margin: "4px 0 0", lineHeight: 1.3 }}>
                  This employee has a linked account. Changing the contact email does not change their login email.
                </p>
              )}
            </div>
          </div>

          <div>
            <label style={labelStyle}>INTERNAL NOTES</label>
            <textarea
              className="dg-input"
              value={form.contactNotes}
              onChange={(e) =>
                setForm((p) => ({ ...p, contactNotes: e.target.value }))
              }
              placeholder="Preferences, availability, etc."
              rows={3}
              style={{
                resize: "vertical",
                minHeight: 80,
              }}
              readOnly={readOnly}
            />
          </div>

          <div>
            <label style={labelStyle}>{certificationLabel.toUpperCase()}</label>
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
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Assigned Focus Areas */}
          <div>
            <label style={labelStyle}>ASSIGNED {focusAreaLabel.toUpperCase()}</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {focusAreas.map((focusArea) => {
                const active = form.focusAreaIds.includes(focusArea.id);
                return (
                  <button
                    key={focusArea.id}
                    onClick={() => toggleFocusArea(focusArea.id)}
                    disabled={readOnly}
                    style={{
                      background: active
                        ? focusArea.colorBg
                        : "var(--color-border-light)",
                      color: active
                        ? focusArea.colorText
                        : "var(--color-text-muted)",
                      border: active
                        ? `1.5px solid ${focusArea.colorText}40`
                        : "1.5px solid transparent",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: readOnly ? "default" : "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {focusArea.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Roles */}
          <div>
            <label style={labelStyle}>{roleLabel.toUpperCase()}</label>
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
                        ? "var(--color-dark)"
                        : "var(--color-border-light)",
                      color: active ? "#fff" : "var(--color-text-muted)",
                      border: "none",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: readOnly ? "default" : "pointer",
                      transition: "all 150ms ease",
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

      {/* Actions */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid var(--color-border-light)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {isActive && showBenchConfirm ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#FEF3C7", padding: "12px 16px", borderRadius: 10, width: "100%" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>
              Bench {getEmployeeDisplayName(form)}? They will be removed from the schedule but their data will be preserved.
            </span>
            <input
              className="dg-input"
              value={benchNote}
              onChange={(e) => setBenchNote(e.target.value)}
              placeholder="Reason (optional) — e.g. 'On leave until June'"
              style={{ fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { onBench(employee.id, benchNote.trim() || undefined); }}
                className="dg-btn dg-btn-primary"
                style={{ background: "#D97706", border: "none", color: "#fff" }}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12, background: "#FEE2E2", padding: "12px 16px", borderRadius: 10, width: "100%" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>
              Terminate {getEmployeeDisplayName(form)}? They will be permanently removed from the schedule and staff list. Historical shift data will be preserved.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onDelete(employee.id)}
                className="dg-btn dg-btn-primary"
                style={{ background: "#DC2626", border: "none", color: "#fff" }}
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
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {canEdit && (
                <>
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
                    {isModified ? "Discard Changes" : "Cancel"}
                  </button>
                </>
              )}
              {!canEdit && (
                <button
                  onClick={onCancel}
                  className="dg-btn dg-btn-secondary"
                  style={{ flex: 1 }}
                >
                  Close
                </button>
              )}
            </div>
            {/* Secondary actions */}
            {canEdit && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(employee.status === "benched" || employee.status === "terminated") && (
                  <button
                    onClick={() => onActivate(employee.id)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "#059669", border: "1px solid #D1FAE5", fontSize: 12, padding: "5px 10px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Activate
                  </button>
                )}
                {onInvite && employee.email && !employee.userId && (
                  <button
                    onClick={() => onInvite(employee)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "#2563EB", border: "1px solid #BFDBFE", fontSize: 12, padding: "5px 10px" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                    </svg>
                    Invite
                  </button>
                )}
                {isActive && (
                  <button
                    onClick={() => setShowBenchConfirm(true)}
                    className="dg-btn dg-btn-ghost"
                    style={{ color: "#D97706", border: "1px solid #FDE68A", fontSize: 12, padding: "5px 10px" }}
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
                    style={{ color: "#DC2626", border: "1px solid #FEE2E2", fontSize: 12, padding: "5px 10px" }}
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

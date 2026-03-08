"use client";

import { useState, useCallback, useMemo } from "react";
import { Employee, Wing } from "@/types";

export interface EditEmployeePanelProps {
  employee: Employee;
  wings: Wing[];
  skillLevels: string[];
  roles: string[];
  onSave: (updatedEmployee: Employee) => void;
  onDelete: (empId: string) => void;
  onCancel: () => void;
}

type EditForm = {
  name: string;
  designation: string;
  wings: string[];
  roles: string[];
  fteWeight: string;
  phone: string;
  email: string;
  contactNotes: string;
};

export default function EditEmployeePanel({
  employee,
  wings,
  skillLevels,
  roles,
  onSave,
  onDelete,
  onCancel,
}: EditEmployeePanelProps) {
  const [form, setForm] = useState<EditForm>({
    name: employee.name,
    designation: employee.designation,
    wings: employee.wings,
    roles: employee.roles,
    fteWeight: employee.fteWeight.toString(),
    phone: employee.phone,
    email: employee.email,
    contactNotes: employee.contactNotes,
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isModified = useMemo(() => {
    return (
      form.name !== employee.name ||
      form.designation !== employee.designation ||
      form.fteWeight !== employee.fteWeight.toString() ||
      form.phone !== employee.phone ||
      form.email !== employee.email ||
      form.contactNotes !== employee.contactNotes ||
      form.wings.length !== employee.wings.length ||
      form.wings.some((w) => !employee.wings.includes(w)) ||
      form.roles.length !== employee.roles.length ||
      form.roles.some((r) => !employee.roles.includes(r))
    );
  }, [form, employee]);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) return;
    if (form.wings.length === 0) return;
    onSave({
      ...employee,
      name: form.name.trim(),
      designation: form.designation,
      wings: form.wings,
      roles: form.roles,
      fteWeight: parseFloat(form.fteWeight) || 1.0,
      phone: form.phone.trim(),
      email: form.email.trim(),
      contactNotes: form.contactNotes.trim(),
    });
  }, [form, employee, onSave]);

  const toggleRole = useCallback(
    (role: string) =>
      setForm((p) => ({
        ...p,
        roles: p.roles.includes(role)
          ? p.roles.filter((r) => r !== role)
          : [...p.roles, role],
      })),
    [],
  );

  const toggleWing = useCallback(
    (wingName: string) =>
      setForm((p) => ({
        ...p,
        wings: p.wings.includes(wingName)
          ? p.wings.filter((w) => w !== wingName)
          : [...p.wings, wingName],
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

  return (
    <div style={{ padding: "20px 24px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name + FTE */}
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>FULL NAME</label>
              <input
                className="dg-input"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Maria S."
              />
            </div>
            <div style={{ width: 80 }}>
              <label style={labelStyle}>FTE</label>
              <input
                className="dg-input"
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={form.fteWeight}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fteWeight: e.target.value }))
                }
              />
            </div>
          </div>

          {/* Contact details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>PHONE</label>
              <input
                className="dg-input"
                value={form.phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="(415) 555-0100"
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
              />
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
            />
          </div>

          <div>
            <label style={labelStyle}>DESIGNATION</label>
            <select
              className="dg-input"
              value={form.designation}
              onChange={(e) =>
                setForm((p) => ({ ...p, designation: e.target.value }))
              }
            >
              {skillLevels.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Assigned Wings */}
          <div>
            <label style={labelStyle}>ASSIGNED WINGS</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {wings.map((wing) => {
                const active = form.wings.includes(wing.name);
                return (
                  <button
                    key={wing.id}
                    onClick={() => toggleWing(wing.name)}
                    style={{
                      background: active
                        ? wing.colorBg
                        : "var(--color-border-light)",
                      color: active
                        ? wing.colorText
                        : "var(--color-text-muted)",
                      border: active
                        ? `1.5px solid ${wing.colorText}40`
                        : "1.5px solid transparent",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {wing.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Roles */}
          <div>
            <label style={labelStyle}>ROLES</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {roles.map((role) => {
                const active = form.roles.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
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
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {role}
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
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        {!showDeleteConfirm ? (
          <>
            <button
              onClick={handleSave}
              disabled={
                !isModified || !form.name.trim() || form.wings.length === 0
              }
              className="dg-btn dg-btn-primary"
              style={{ minWidth: 120 }}
            >
              Save Changes
            </button>
            <button
              onClick={onCancel}
              className="dg-btn dg-btn-secondary"
            >
              Discard Changes
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="dg-btn dg-btn-ghost"
              style={{ color: "var(--color-error)", border: "1px solid #FEE2E2" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Remove Staff
            </button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--color-error-bg)", padding: "8px 16px", borderRadius: 8, width: "100%" }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-error)",
                flex: 1,
              }}
            >
              Remove {form.name}? All historical shift data will be preserved but they will no longer appear on the grid.
            </span>
            <button
              onClick={() => onDelete(employee.id)}
              className="dg-btn dg-btn-primary"
              style={{ background: "var(--color-error)", border: "none" }}
            >
              Confirm Removal
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="dg-btn dg-btn-secondary"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

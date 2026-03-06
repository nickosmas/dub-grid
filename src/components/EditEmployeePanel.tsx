"use client";

import { useState, useCallback, useMemo } from "react";
import { DESIGNATIONS, ROLES } from "@/lib/constants";
import { Employee, Wing } from "@/types";

export interface EditEmployeePanelProps {
  employee: Employee;
  wings: Wing[];
  onSave: (updatedEmployee: Employee) => void;
  onDelete: (empId: number) => void;
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
        roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role],
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 11px",
    border: "1.5px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    background: "#fff",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div style={{ padding: "20px 20px 20px calc(20px - 4px)" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Name + FTE */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>FULL NAME</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ width: 80 }}>
              <label style={labelStyle}>FTE</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={form.fteWeight}
                onChange={(e) => setForm((p) => ({ ...p, fteWeight: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Contact details */}
          <div>
            <label style={labelStyle}>PHONE</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="e.g. (415) 555-0100"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>EMAIL</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="e.g. name@example.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>CONTACT NOTES</label>
            <textarea
              value={form.contactNotes}
              onChange={(e) => setForm((p) => ({ ...p, contactNotes: e.target.value }))}
              placeholder="Emergency contact, preferences, etc."
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {/* Skill Level */}
          <div>
            <label style={labelStyle}>SKILL LEVEL</label>
            <select
              value={form.designation}
              onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))}
              style={inputStyle}
            >
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Assigned Wings */}
          <div>
            <label style={labelStyle}>ASSIGNED WINGS</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {wings.map((wing) => {
                const active = form.wings.includes(wing.name);
                return (
                  <button
                    key={wing.id}
                    onClick={() => toggleWing(wing.name)}
                    style={{
                      background: active ? wing.colorBg : "var(--color-border-light)",
                      color: active ? wing.colorText : "var(--color-text-muted)",
                      border: active ? `1.5px solid ${wing.colorText}40` : "1.5px solid transparent",
                      borderRadius: 6,
                      padding: "7px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
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
            <label style={labelStyle}>ROLES / QUALIFICATIONS</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROLES.map((role) => {
                const active = form.roles.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    style={{
                      background: active ? "var(--color-dark)" : "var(--color-border-light)",
                      color: active ? "#fff" : "var(--color-text-muted)",
                      border: "none",
                      borderRadius: 20,
                      padding: "4px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
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
          marginTop: 18,
          paddingTop: 16,
          borderTop: "1px solid var(--color-border-light)",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        {!showDeleteConfirm ? (
          <>
            <button
              onClick={handleSave}
              disabled={!isModified || !form.name.trim() || form.wings.length === 0}
              style={{
                background: isModified && form.name.trim() && form.wings.length > 0
                  ? "var(--color-accent-gradient)" : "#ccc",
                border: "none", color: "#fff", borderRadius: 8,
                padding: "9px 20px", fontSize: 13, fontWeight: 700,
                cursor: isModified ? "pointer" : "not-allowed",
              }}
            >
              Save Changes
            </button>
            <button
              onClick={onCancel}
              style={{
                background: "var(--color-border-light)", border: "none", borderRadius: 8,
                color: "var(--color-text-muted)", fontSize: 13, padding: "9px 16px",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: "none", border: "1px solid #FEE2E2", borderRadius: 8,
                color: "#EF4444", fontSize: 13, padding: "9px 16px",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              Delete Employee
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginRight: 8 }}>
              Delete {form.name}? This cannot be undone.
            </span>
            <button
              onClick={() => onDelete(employee.id)}
              style={{
                background: "#EF4444", border: "none", color: "#fff", borderRadius: 8,
                padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13,
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                background: "var(--color-border-light)", border: "none", borderRadius: 8,
                color: "var(--color-text-muted)", padding: "9px 16px",
                cursor: "pointer", fontWeight: 600, fontSize: 13,
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import Modal from "@/components/Modal";
import { DESIGNATIONS, ROLES } from "@/lib/constants";
import { Employee, Wing } from "@/types";

type NewEmpForm = {
  name: string;
  designation: string;
  wings: string[];
  roles: string[];
  fteWeight: string;
  phone: string;
  email: string;
  contactNotes: string;
};

interface AddEmployeeModalProps {
  wings: Wing[];
  onAdd: (emp: Omit<Employee, "id" | "seniority">) => void;
  onClose: () => void;
}

export default function AddEmployeeModal({ wings, onAdd, onClose }: AddEmployeeModalProps) {
  const [form, setForm] = useState<NewEmpForm>({
    name: "",
    designation: "STAFF",
    wings: wings.length > 0 ? [wings[0].name] : [],
    roles: [],
    fteWeight: "1.0",
    phone: "",
    email: "",
    contactNotes: "",
  });

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) return;
    if (form.wings.length === 0) return;
    onAdd({
      name: form.name.trim(),
      designation: form.designation,
      wings: form.wings,
      roles: form.roles,
      fteWeight: parseFloat(form.fteWeight) || 1.0,
      phone: form.phone.trim(),
      email: form.email.trim(),
      contactNotes: form.contactNotes.trim(),
    });
  }, [form, onAdd]);

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
    padding: "9px 12px",
    border: "1.5px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
  };

  return (
    <Modal title="Add Staff Member" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Name + FTE */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              FULL NAME
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="e.g. Maria S."
              style={inputStyle}
            />
          </div>
          <div style={{ width: 80 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              FTE
            </label>
            <input
              type="number" step="0.1" min="0" max="1"
              value={form.fteWeight}
              onChange={(e) => setForm((p) => ({ ...p, fteWeight: e.target.value }))}
              placeholder="1.0"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Contact */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              PHONE
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="(415) 555-0100"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="name@example.com"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Assigned Wings */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 8 }}>
            ASSIGNED WINGS
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                    borderRadius: 20, padding: "5px 14px",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {wing.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Designation */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 6 }}>
            DESIGNATION
          </label>
          <select
            value={form.designation}
            onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))}
            style={{ ...inputStyle, background: "#fff" }}
          >
            {DESIGNATIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Roles */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 8 }}>
            ROLES / QUALIFICATIONS
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ROLES.map((role) => {
              const active = form.roles.includes(role);
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  style={{
                    background: active ? "var(--color-dark)" : "var(--color-border-light)",
                    color: active ? "#fff" : "var(--color-text-muted)",
                    border: "none", borderRadius: 20, padding: "5px 14px",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {role}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          style={{
            background: "var(--color-accent-gradient)", border: "none", color: "#fff",
            borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", marginTop: 4,
          }}
        >
          Add to Schedule
        </button>
      </div>
    </Modal>
  );
}

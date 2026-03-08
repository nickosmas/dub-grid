"use client";

import { useState, useCallback, useRef } from "react";
import Modal from "@/components/Modal";
import { Employee, Wing } from "@/types";

type RowEntry = {
  _id: string;
  name: string;
  designation: string;
  wings: string[];
  fteWeight: string;
};

function makeRow(designation: string, wings: string[]): RowEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    name: "",
    designation,
    wings,
    fteWeight: "1.0",
  };
}

interface AddEmployeeModalProps {
  wings: Wing[];
  skillLevels: string[];
  roles: string[];
  onAdd: (employees: Omit<Employee, "id" | "seniority">[]) => void;
  onClose: () => void;
}

export default function AddEmployeeModal({ wings, skillLevels, onAdd, onClose }: AddEmployeeModalProps) {
  const defaultDesig = skillLevels[0] ?? "STAFF";
  const defaultWings = wings.length > 0 ? [wings[0].name] : [];

  const [rows, setRows] = useState<RowEntry[]>(() => [
    makeRow(defaultDesig, defaultWings),
    makeRow(defaultDesig, defaultWings),
    makeRow(defaultDesig, defaultWings),
  ]);

  const lastNameRef = useRef<HTMLInputElement | null>(null);

  const validRows = rows.filter((r) => r.name.trim() && r.wings.length > 0);

  const updateRow = useCallback((id: string, patch: Partial<Omit<RowEntry, "_id">>) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }, []);

  const toggleWing = useCallback((id: string, wingName: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const wings = r.wings.includes(wingName)
          ? r.wings.filter((w) => w !== wingName)
          : [...r.wings, wingName];
        return { ...r, wings };
      }),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeRow(last?.designation ?? defaultDesig, last?.wings ?? defaultWings)];
    });
    // Focus the new row's name input on next tick
    setTimeout(() => lastNameRef.current?.focus(), 0);
  }, [defaultDesig, defaultWings]);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }, []);

  const handleSubmit = useCallback(() => {
    if (validRows.length === 0) return;
    onAdd(
      validRows.map((r) => ({
        name: r.name.trim(),
        designation: r.designation,
        wings: r.wings,
        roles: [],
        fteWeight: parseFloat(r.fteWeight) || 1.0,
        phone: "",
        email: "",
        contactNotes: "",
      })),
    );
  }, [validRows, onAdd]);

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--color-text-subtle)",
    letterSpacing: "0.06em",
  };

  return (
    <Modal title="Add Staff Members" onClose={onClose} style={{ maxWidth: 960, width: "92vw" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 1fr 28px",
            gap: 8,
            paddingBottom: 6,
            borderBottom: "1px solid var(--color-border-light)",
            marginBottom: 4,
          }}
        >
          {["NAME", "DESIGNATION", "WINGS", ""].map((h) => (
            <div key={h} style={labelStyle}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto", paddingRight: 2 }}>
          {rows.map((row, idx) => {
            const isLast = idx === rows.length - 1;
            return (
              <div
                key={row._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 1fr 28px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {/* Name */}
                <input
                  ref={isLast ? lastNameRef : undefined}
                  className="dg-input"
                  value={row.name}
                  onChange={(e) => updateRow(row._id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (isLast) addRow();
                    }
                  }}
                  placeholder="Full name"
                  autoFocus={idx === 0}
                  style={{ fontSize: 13 }}
                />

                {/* Designation */}
                <select
                  className="dg-input"
                  value={row.designation}
                  onChange={(e) => updateRow(row._id, { designation: e.target.value })}
                  style={{ fontSize: 12 }}
                >
                  {skillLevels.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* Wings */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {wings.map((wing) => {
                    const active = row.wings.includes(wing.name);
                    return (
                      <button
                        key={wing.id}
                        onClick={() => toggleWing(row._id, wing.name)}
                        style={{
                          background: active ? wing.colorBg : "var(--color-border-light)",
                          color: active ? wing.colorText : "var(--color-text-muted)",
                          border: active ? `1.5px solid ${wing.colorText}40` : "1.5px solid transparent",
                          borderRadius: 20,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "all 120ms ease",
                        }}
                      >
                        {wing.name}
                      </button>
                    );
                  })}
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeRow(row._id)}
                  className="dg-btn dg-btn-ghost"
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    padding: "2px 4px",
                    color: "var(--color-text-faint)",
                    opacity: rows.length === 1 ? 0.3 : 1,
                    cursor: rows.length === 1 ? "default" : "pointer",
                  }}
                  disabled={rows.length === 1}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--color-border-light)",
          }}
        >
          <button
            onClick={addRow}
            className="dg-btn"
            style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add row
          </button>
          <button
            onClick={handleSubmit}
            className="dg-btn dg-btn-primary"
            style={{ padding: "10px 20px" }}
            disabled={validRows.length === 0}
          >
            Add {validRows.length > 0 ? `${validRows.length} ` : ""}Staff Member{validRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

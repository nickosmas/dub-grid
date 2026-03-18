"use client";

import { useState, useCallback, useRef } from "react";
import Modal from "@/components/Modal";
import { Employee, FocusArea, NamedItem } from "@/types";
import CustomSelect from "@/components/CustomSelect";

type RowEntry = {
  _id: string;
  name: string;
  certificationId: number | null;
  focusAreaIds: number[];
};

function makeRow(certificationId: number | null, focusAreaIds: number[]): RowEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    name: "",
    certificationId,
    focusAreaIds,
  };
}

interface AddEmployeeModalProps {
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  onAdd: (employees: Omit<Employee, "id" | "seniority">[]) => void;
  onClose: () => void;
}

export default function AddEmployeeModal({ focusAreas, certifications, focusAreaLabel = "Focus Areas", certificationLabel = "Certification", onAdd, onClose }: AddEmployeeModalProps) {
  const defaultCertId: number | null = null;
  const defaultFocusAreaIds = focusAreas.length > 0 ? [focusAreas[0].id] : [];

  const [rows, setRows] = useState<RowEntry[]>(() => [
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
  ]);

  const lastNameRef = useRef<HTMLInputElement | null>(null);

  const validRows = rows.filter((r) => r.name.trim() && r.focusAreaIds.length > 0);

  const updateRow = useCallback((id: string, patch: Partial<Omit<RowEntry, "_id">>) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }, []);

  const toggleFocusArea = useCallback((id: string, focusAreaId: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r;
        const focusAreaIds = r.focusAreaIds.includes(focusAreaId)
          ? r.focusAreaIds.filter((fId) => fId !== focusAreaId)
          : [...r.focusAreaIds, focusAreaId];
        return { ...r, focusAreaIds };
      }),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, makeRow(last?.certificationId ?? defaultCertId, last?.focusAreaIds ?? defaultFocusAreaIds)];
    });
    // Focus the new row's name input on next tick
    setTimeout(() => lastNameRef.current?.focus(), 0);
  }, [defaultCertId, defaultFocusAreaIds]);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }, []);

  const handleSubmit = useCallback(() => {
    if (validRows.length === 0) return;
    onAdd(
      validRows.map((r) => ({
        name: r.name.trim(),
        certificationId: r.certificationId,
        focusAreaIds: r.focusAreaIds,
        roleIds: [],
        phone: "",
        email: "",
        contactNotes: "",
        status: "active" as const,
        statusChangedAt: null,
        statusNote: "",
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
          {["NAME", certificationLabel.toUpperCase(), focusAreaLabel.toUpperCase(), ""].map((h) => (
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

                {/* Certification */}
                <CustomSelect
                  value={row.certificationId != null ? String(row.certificationId) : ""}
                  options={[
                    { value: "", label: "— None —" },
                    ...certifications.map((d) => ({ value: String(d.id), label: d.name !== d.abbr ? `${d.name} (${d.abbr})` : d.name })),
                  ]}
                  onChange={(v) => updateRow(row._id, { certificationId: v ? Number(v) : null })}
                  style={{ width: "100%" }}
                  fontSize={12}
                />

                {/* Focus Areas */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {focusAreas.map((focusArea) => {
                    const active = row.focusAreaIds.includes(focusArea.id);
                    return (
                      <button
                        key={focusArea.id}
                        onClick={() => toggleFocusArea(row._id, focusArea.id)}
                        style={{
                          background: active ? focusArea.colorBg : "var(--color-border-light)",
                          color: active ? focusArea.colorText : "var(--color-text-muted)",
                          border: active ? `1.5px solid ${focusArea.colorText}40` : "1.5px solid transparent",
                          borderRadius: 20,
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "all 120ms ease",
                        }}
                      >
                        {focusArea.name}
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

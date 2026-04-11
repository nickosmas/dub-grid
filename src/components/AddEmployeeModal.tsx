"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import Modal from "@/components/Modal";
import { Employee, FocusArea, NamedItem, DirectoryPerson } from "@/types";
import CustomSelect from "@/components/CustomSelect";

type RowEntry = {
  _id: string;
  firstName: string;
  lastName: string;
  certificationId: number | null;
  focusAreaIds: number[];
};

function makeRow(certificationId: number | null, focusAreaIds: number[]): RowEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    firstName: "",
    lastName: "",
    certificationId,
    focusAreaIds,
  };
}

export type NewEmployeeData = Omit<Employee, "id" | "seniority"> & {
  /** Transient: if set, link this new employee to an existing app-only user after creation. */
  _linkToUserId?: string;
};

interface AddEmployeeModalProps {
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  /** Directory data for matching existing app-only users by name. */
  directory?: DirectoryPerson[];
  onAdd: (employees: NewEmployeeData[]) => void;
  onClose: () => void;
}

export default function AddEmployeeModal({ focusAreas, certifications, focusAreaLabel = "Focus Areas", certificationLabel = "Certification", directory = [], onAdd, onClose }: AddEmployeeModalProps) {
  const defaultCertId: number | null = null;
  const defaultFocusAreaIds = useMemo(
    () => focusAreas.length > 0 ? [focusAreas[0].id] : [],
    [focusAreas]
  );

  const [rows, setRows] = useState<RowEntry[]>(() => [
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
  ]);

  const lastNameRef = useRef<HTMLInputElement | null>(null);

  // Build a lookup of app-only users by normalized "first last" name for matching
  const appOnlyByName = useMemo(() => {
    const map = new Map<string, DirectoryPerson>();
    for (const p of directory) {
      if (p.source !== "user_only" || !p.userId) continue;
      const key = `${p.firstName.trim()} ${p.lastName.trim()}`.toLowerCase();
      if (key.length > 1) map.set(key, p);
    }
    return map;
  }, [directory]);

  // For each row, find a matching app-only user
  const matchForRow = useCallback(
    (row: RowEntry): DirectoryPerson | undefined => {
      const key = `${row.firstName.trim()} ${row.lastName.trim()}`.toLowerCase();
      return key.length > 1 ? appOnlyByName.get(key) : undefined;
    },
    [appOnlyByName],
  );

  const validRows = rows.filter((r) => r.firstName.trim() && r.focusAreaIds.length > 0);

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
      validRows.map((r) => {
        const match = matchForRow(r);
        return {
          firstName: r.firstName.trim(),
          lastName: r.lastName.trim(),
          certificationId: r.certificationId,
          focusAreaIds: r.focusAreaIds,
          roleIds: [],
          phone: "",
          email: "",
          contactNotes: "",
          status: "active" as const,
          statusChangedAt: null,
          statusNote: "",
          userId: null,
          departmentIds: match?.departmentIds ?? [],
          deptAdminIds: match?.deptAdminIds ?? [],
          version: 0,
          _linkToUserId: match?.userId ?? undefined,
        };
      }),
    );
  }, [validRows, onAdd, matchForRow]);

  return (
    <Modal title="Add Staff Members" onClose={onClose} style={{ maxWidth: 960, width: "92vw" }}>
      <div className="flex flex-col">

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_140px_1fr_28px] gap-2 pb-1.5 border-b border-[var(--color-border-light)] mb-1">
          {["FIRST NAME", "LAST NAME", certificationLabel.toUpperCase(), focusAreaLabel.toUpperCase(), ""].map((h, i) => (
            <div key={`col-${i}`} className="text-[11px] font-bold text-[var(--color-text-subtle)] tracking-wider">{h}</div>
          ))}
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-0.5">
          {rows.map((row, idx) => {
            const isLast = idx === rows.length - 1;
            const match = matchForRow(row);
            return (
              <div key={row._id}>
              <div
                className="grid grid-cols-[1fr_1fr_140px_1fr_28px] gap-2 items-center"
              >
                {/* First Name */}
                <input
                  className="dg-input"
                  value={row.firstName}
                  onChange={(e) => updateRow(row._id, { firstName: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (isLast) addRow();
                    }
                  }}
                  placeholder="First name"
                  autoFocus={idx === 0}
                />

                {/* Last Name */}
                <input
                  ref={isLast ? lastNameRef : undefined}
                  className="dg-input"
                  value={row.lastName}
                  onChange={(e) => updateRow(row._id, { lastName: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (isLast) addRow();
                    }
                  }}
                  placeholder="Last name"
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
                <div className="flex flex-wrap gap-1.5">
                  {focusAreas.map((focusArea) => {
                    const active = row.focusAreaIds.includes(focusArea.id);
                    return (
                      <button
                        key={focusArea.id}
                        onClick={() => toggleFocusArea(row._id, focusArea.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150 border-[1.5px] border-transparent ${
                          active
                            ? "bg-[var(--color-brand)] text-[var(--color-text-inverse)]"
                            : "bg-[var(--color-bg-secondary)] text-[var(--color-text-faint)] hover:bg-[var(--color-border-light)]"
                        }`}
                      >
                        {focusArea.name}
                      </button>
                    );
                  })}
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeRow(row._id)}
                  disabled={rows.length === 1}
                  className={`flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-text-faint)] transition-colors duration-120 ${
                    rows.length === 1
                      ? "opacity-30 cursor-default"
                      : "hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {match && (
                <div className="flex items-center gap-1.5 px-2 py-1 mt-0.5 mb-1 rounded-lg text-[11px] font-medium" style={{ background: "var(--color-brand-bg)", color: "var(--color-brand)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  This person already has app access. They will be linked automatically.
                </div>
              )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-[var(--color-border-light)]">
          <button
            onClick={addRow}
            className="dg-btn dg-btn-ghost text-[var(--dg-fs-caption)] flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add row
          </button>
          <button
            onClick={handleSubmit}
            className="dg-btn dg-btn-primary px-5 py-2.5"
            disabled={validRows.length === 0}
          >
            Add {validRows.length > 0 ? `${validRows.length} ` : ""}Staff Member{validRows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

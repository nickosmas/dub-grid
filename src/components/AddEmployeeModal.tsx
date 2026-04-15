"use client";

import { useState, useCallback, useRef, useMemo, useId } from "react";
import Modal from "@/components/Modal";
import { Employee, FocusArea, NamedItem } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { MOBILE, useMediaQuery } from "@/hooks";

type RowEntry = {
  _id: string;
  firstName: string;
  lastName: string;
  certificationId: number | null;
  focusAreaIds: number[];
};

function makeRow(
  certificationId: number | null,
  focusAreaIds: number[],
): RowEntry {
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
  onAdd: (employees: NewEmployeeData[]) => void;
  onClose: () => void;
}

export default function AddEmployeeModal({
  focusAreas,
  certifications,
  focusAreaLabel = "Focus Areas",
  certificationLabel = "Certification",
  onAdd,
  onClose,
}: AddEmployeeModalProps) {
  const isMobile = useMediaQuery(MOBILE);
  const descriptionId = useId();
  const defaultCertId: number | null = null;
  const defaultFocusAreaIds = useMemo(
    () => (focusAreas.length > 0 ? [focusAreas[0].id] : []),
    [focusAreas],
  );

  const [rows, setRows] = useState<RowEntry[]>(() => [
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
    makeRow(defaultCertId, defaultFocusAreaIds),
  ]);

  const newRowFirstNameRef = useRef<HTMLInputElement | null>(null);

  const validRows = rows.filter(
    (r) => r.firstName.trim() && r.lastName.trim() && r.focusAreaIds.length > 0,
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<Omit<RowEntry, "_id">>) => {
      setRows((prev) =>
        prev.map((r) => (r._id === id ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

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
      return [
        ...prev,
        makeRow(
          last?.certificationId ?? defaultCertId,
          last?.focusAreaIds ?? defaultFocusAreaIds,
        ),
      ];
    });
    // Focus the new row's first-name input on next tick.
    setTimeout(() => newRowFirstNameRef.current?.focus(), 0);
  }, [defaultCertId, defaultFocusAreaIds]);

  const removeRow = useCallback((id: string) => {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r._id !== id) : prev,
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (validRows.length === 0) return;
    onAdd(
      validRows.map((r) => ({
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
        departmentIds: [],
        deptAdminIds: [],
        version: 0,
      })),
    );
  }, [validRows, onAdd]);

  const scrollMaxHeight = isMobile
    ? "calc(100dvh - 300px)"
    : "min(620px, calc(100vh - 250px))";

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "var(--dg-fs-footnote)",
    fontWeight: 600,
    color: "var(--color-text-muted)",
    letterSpacing: "0.02em",
  };

  return (
    <Modal
      title="Add Staff Members"
      onClose={onClose}
      aria-describedby={descriptionId}
      style={{
        maxWidth: 1080,
        width: isMobile ? "calc(100vw - 32px)" : "min(1080px, calc(100vw - 48px))",
        maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 40px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
        <p
          id={descriptionId}
          style={{
            margin: "-8px 0 0",
            fontSize: "var(--dg-fs-label)",
            lineHeight: 1.5,
            color: "var(--color-text-muted)",
            maxWidth: 760,
          }}
        >
          Add several people at once, choose their {certificationLabel.toLowerCase()}, and
          assign one or more {focusAreaLabel.toLowerCase()} before saving.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--color-text-muted)",
            }}
          >
            {rows.length} row{rows.length === 1 ? "" : "s"} total
            {" · "}
            {validRows.length} ready to add
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              maxHeight: scrollMaxHeight,
              overflowY: "auto",
              paddingRight: isMobile ? 0 : 4,
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              background: "var(--color-surface)",
            }}
          >
            {rows.map((row, idx) => {
              const rowName =
                `${row.firstName.trim()} ${row.lastName.trim()}`.trim()
                || `Staff Member ${idx + 1}`;
              const rowReady =
                row.firstName.trim().length > 0
                && row.lastName.trim().length > 0
                && row.focusAreaIds.length > 0;
              const rowStatus = rowReady ? "Ready to add" : null;

              return (
                <div
                  key={row._id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    padding: isMobile ? "14px" : "16px",
                    borderTop: idx === 0 ? "none" : "1px solid var(--color-border-light)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {rowName}
                      </div>
                      {rowStatus && (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {rowStatus}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeRow(row._id)}
                      disabled={rows.length === 1}
                      aria-label={`Remove staff member row ${idx + 1}`}
                      className={`flex items-center justify-center rounded-lg text-[var(--color-text-faint)] transition-colors duration-120 ${
                        rows.length === 1
                          ? "opacity-30 cursor-default"
                          : "hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                      }`}
                      style={{
                        width: 30,
                        height: 30,
                        flexShrink: 0,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "minmax(180px, 1fr) minmax(180px, 1fr) minmax(220px, 0.95fr)",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={fieldLabelStyle}>
                        First Name <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <input
                        ref={idx === rows.length - 1 ? newRowFirstNameRef : undefined}
                        className="dg-input"
                        value={row.firstName}
                        onChange={(e) =>
                          updateRow(row._id, { firstName: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && idx === rows.length - 1) {
                            e.preventDefault();
                            addRow();
                          }
                        }}
                        placeholder="First name"
                        autoFocus={idx === 0}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={fieldLabelStyle}>
                        Last Name <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <input
                        className="dg-input"
                        value={row.lastName}
                        onChange={(e) =>
                          updateRow(row._id, { lastName: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && idx === rows.length - 1) {
                            e.preventDefault();
                            addRow();
                          }
                        }}
                        placeholder="Last name"
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={fieldLabelStyle}>{certificationLabel}</label>
                      <CustomSelect
                        value={
                          row.certificationId != null
                            ? String(row.certificationId)
                            : ""
                        }
                        options={[
                          { value: "", label: "— None —" },
                          ...certifications.map((d) => ({
                            value: String(d.id),
                            label:
                              d.name !== d.abbr ? `${d.name} (${d.abbr})` : d.name,
                          })),
                        ]}
                        onChange={(v) =>
                          updateRow(row._id, {
                            certificationId: v ? Number(v) : null,
                          })
                        }
                        style={{ width: "100%" }}
                        fontSize={12}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <label style={fieldLabelStyle}>
                        {focusAreaLabel} <span style={{ color: "var(--color-danger)" }}>*</span>
                      </label>
                      <span
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        Select one or more
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {focusAreas.map((focusArea) => {
                        const active = row.focusAreaIds.includes(focusArea.id);
                        return (
                          <SelectableTag
                            key={focusArea.id}
                            selected={active}
                            onClick={() => toggleFocusArea(row._id, focusArea.id)}
                            padding="4px 12px"
                            fontSize="var(--dg-fs-caption)"
                            unselectedBackground="var(--color-bg-secondary)"
                            unselectedBorderColor="transparent"
                            unselectedTextColor="var(--color-text-faint)"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {focusArea.name}
                          </SelectableTag>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: 12,
            marginTop: 4,
            paddingTop: 16,
            borderTop: "1px solid var(--color-border-light)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
            {validRows.length === 0
              ? "Complete the fields marked with * to create a profile."
              : `Ready to add ${validRows.length} staff member${validRows.length === 1 ? "" : "s"}.`}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              width: isMobile ? "100%" : undefined,
              justifyContent: isMobile ? "stretch" : "flex-end",
            }}
          >
            <button
              onClick={addRow}
              className="dg-btn dg-btn-secondary"
              style={{
                flex: isMobile ? 1 : undefined,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Another Person
            </button>
            <button
              onClick={onClose}
              className="dg-btn dg-btn-ghost"
              style={{ flex: isMobile ? 1 : undefined }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="dg-btn dg-btn-primary px-5 py-2.5"
              disabled={validRows.length === 0}
              style={{ flex: isMobile ? 1 : undefined }}
            >
              Add {validRows.length > 0 ? `${validRows.length} ` : ""}Staff Member
              {validRows.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

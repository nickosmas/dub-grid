"use client";
import { X } from "lucide-react";

import { useState, useCallback, useRef, useMemo, useId } from "react";
import {
  getOptionalStaffEmailError,
  getStaffNameError,
  normalizeOptionalStaffEmail,
  normalizeStaffName,
} from "@dubgrid/contracts";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { Employee, FocusArea, NamedItem } from "@/types";
import CustomSelect from "@/components/CustomSelect";
import { SelectableTag } from "@/components/ui/selectable-tag";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { MOBILE, useMediaQuery } from "@/hooks";

type RowEntry = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  employmentType: Employee["employmentType"];
  certificationId: number | null;
  focusAreaIds: number[];
};

type RowDraft = Omit<RowEntry, "_id">;

function makeRow(certificationId: number | null, focusAreaIds: number[]): RowEntry {
  return {
    _id: Math.random().toString(36).slice(2),
    firstName: "",
    lastName: "",
    email: "",
    employmentType: "full_time",
    certificationId,
    focusAreaIds,
  };
}

function serializeRows(rows: RowDraft[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      ...row,
      focusAreaIds: [...row.focusAreaIds].sort((left, right) => left - right),
    })),
  );
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
  const initialRowsSnapshot = useMemo(
    () =>
      serializeRows(
        Array.from({ length: 3 }, () => ({
          firstName: "",
          lastName: "",
          email: "",
          employmentType: "full_time",
          certificationId: defaultCertId,
          focusAreaIds: [...defaultFocusAreaIds],
        })),
      ),
    [defaultCertId, defaultFocusAreaIds],
  );
  const hasUnsavedChanges =
    serializeRows(
      rows.map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        employmentType: row.employmentType,
        certificationId: row.certificationId,
        focusAreaIds: row.focusAreaIds,
      })),
    ) !== initialRowsSnapshot;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });
  const handleRequestClose = useCallback(() => {
    if (requestClose()) {
      onClose();
    }
  }, [onClose, requestClose]);

  const rowErrors = useMemo(
    () =>
      rows.map((row) => ({
        firstName:
          row.firstName.trim().length > 0 ? getStaffNameError(row.firstName, "First name") : null,
        lastName:
          row.lastName.trim().length > 0 ? getStaffNameError(row.lastName, "Last name") : null,
        email: row.email.trim().length > 0 ? getOptionalStaffEmailError(row.email) : null,
        focusAreaIds:
          row.focusAreaIds.length === 0 &&
          (row.firstName.trim().length > 0 || row.lastName.trim().length > 0)
            ? `Select at least one ${focusAreaLabel.replace(/s$/i, "").toLowerCase()}`
            : null,
      })),
    [focusAreaLabel, rows],
  );
  const validRows = rows.filter(
    (row, index) =>
      row.firstName.trim() &&
      row.lastName.trim() &&
      row.focusAreaIds.length > 0 &&
      !rowErrors[index]?.firstName &&
      !rowErrors[index]?.lastName &&
      !rowErrors[index]?.email,
  );

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
      return [
        ...prev,
        makeRow(last?.certificationId ?? defaultCertId, last?.focusAreaIds ?? defaultFocusAreaIds),
      ];
    });
    // Focus the new row's first-name input on next tick.
    setTimeout(() => newRowFirstNameRef.current?.focus(), 0);
  }, [defaultCertId, defaultFocusAreaIds]);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._id !== id) : prev));
  }, []);

  const handleSubmit = useCallback(() => {
    if (validRows.length === 0) return;
    onAdd(
      validRows.map((r) => ({
        firstName: normalizeStaffName(r.firstName),
        lastName: normalizeStaffName(r.lastName),
        employmentType: r.employmentType,
        certificationId: r.certificationId,
        focusAreaIds: r.focusAreaIds,
        roleIds: [],
        phone: "",
        email: normalizeOptionalStaffEmail(r.email),
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

  const scrollMaxHeight = isMobile ? "calc(100dvh - 300px)" : "min(620px, calc(100vh - 250px))";

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: "var(--dg-type-field-title-size)",
    fontWeight: "var(--dg-type-field-title-weight)",
    color: "var(--dg-type-field-title-color)",
    letterSpacing: "var(--dg-type-field-title-letter-spacing)",
    lineHeight: "var(--dg-type-field-title-line-height)",
  };

  return (
    <>
      <Modal
        title="Add Staff Members"
        onClose={onClose}
        onRequestClose={requestClose}
        aria-describedby={descriptionId}
        style={{
          maxWidth: 1080,
          width: isMobile ? "calc(100vw - 32px)" : "min(1080px, calc(100vw - 48px))",
          maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 40px)",
        }}
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}>
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
              <Button
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
              </Button>
              <Button
                onClick={handleRequestClose}
                className="dg-btn dg-btn-secondary"
                style={{ flex: isMobile ? 1 : undefined }}
              >
                {EDITOR_ACTION_LABELS.close}
              </Button>
              <Button
                onClick={handleSubmit}
                className="dg-btn dg-btn-primary"
                disabled={validRows.length === 0}
                style={{ flex: isMobile ? 1 : undefined }}
              >
                Add {validRows.length > 0 ? `${validRows.length} ` : ""}Staff Member
                {validRows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <p
            id={descriptionId}
            style={{
              margin: "-8px 0 0",
              fontSize: "var(--dg-fs-label)",
              lineHeight: 1.5,
              color: "var(--dg-color-text-muted)",
              maxWidth: 760,
            }}
          >
            Add several people at once, choose their {certificationLabel.toLowerCase()}, and assign
            one or more {focusAreaLabel.toLowerCase()} before saving.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-muted)",
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
                border: "1px solid var(--dg-color-border)",
                borderRadius: "var(--dg-radius-md)",
                background: "var(--dg-color-surface)",
              }}
            >
              {rows.map((row, idx) => {
                const errors = rowErrors[idx] ?? {
                  firstName: null,
                  lastName: null,
                  focusAreaIds: null,
                };
                const rowName =
                  `${row.firstName.trim()} ${row.lastName.trim()}`.trim() ||
                  `Staff Member ${idx + 1}`;
                const rowReady =
                  row.firstName.trim().length > 0 &&
                  row.lastName.trim().length > 0 &&
                  row.focusAreaIds.length > 0 &&
                  !errors.firstName &&
                  !errors.lastName;
                const rowStatus = rowReady ? "Ready to add" : null;

                return (
                  <div
                    key={row._id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      padding: isMobile ? "14px" : "16px",
                      borderTop: idx === 0 ? "none" : "1px solid var(--dg-color-border-light)",
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
                            color: "var(--dg-color-text-primary)",
                          }}
                        >
                          {rowName}
                        </div>
                        {rowStatus && (
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: "var(--dg-fs-footnote)",
                              color: "var(--dg-color-text-muted)",
                            }}
                          >
                            {rowStatus}
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => removeRow(row._id)}
                        disabled={rows.length === 1}
                        aria-label={`Remove staff member row ${idx + 1}`}
                        className={`flex items-center justify-center rounded-lg text-[var(--dg-color-text-primary)] transition-colors duration-120 ${
                          rows.length === 1
                            ? "opacity-30 cursor-default"
                            : "hover:bg-[var(--dg-color-bg-secondary)] hover:text-[var(--dg-color-text-primary)] cursor-pointer"
                        }`}
                        style={{
                          width: 30,
                          height: 30,
                          flexShrink: 0,
                        }}
                      >
                        <X size={14} strokeWidth={2.5} />
                      </Button>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "minmax(160px, 1fr) minmax(160px, 1fr) minmax(160px, 0.8fr) minmax(220px, 0.95fr)",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={fieldLabelStyle}>
                          First name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                        </label>
                        <input
                          ref={idx === rows.length - 1 ? newRowFirstNameRef : undefined}
                          className="dg-input"
                          value={row.firstName}
                          onChange={(e) => updateRow(row._id, { firstName: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && idx === rows.length - 1) {
                              e.preventDefault();
                              addRow();
                            }
                          }}
                          placeholder="First name"
                          autoFocus={idx === 0}
                        />
                        {errors.firstName ? (
                          <div
                            role="alert"
                            style={{
                              fontSize: "var(--dg-fs-footnote)",
                              color: "var(--dg-color-danger)",
                            }}
                          >
                            {errors.firstName}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={fieldLabelStyle}>
                          Last name <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                        </label>
                        <input
                          className="dg-input"
                          value={row.lastName}
                          onChange={(e) => updateRow(row._id, { lastName: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && idx === rows.length - 1) {
                              e.preventDefault();
                              addRow();
                            }
                          }}
                          placeholder="Last name"
                        />
                        {errors.lastName ? (
                          <div
                            role="alert"
                            style={{
                              fontSize: "var(--dg-fs-footnote)",
                              color: "var(--dg-color-danger)",
                            }}
                          >
                            {errors.lastName}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={fieldLabelStyle}>Employment</label>
                        <CustomSelect
                          value={row.employmentType}
                          options={[
                            { value: "full_time", label: "Full-time" },
                            { value: "part_time", label: "Part-time" },
                          ]}
                          onChange={(v) =>
                            updateRow(row._id, {
                              employmentType: v === "part_time" ? "part_time" : "full_time",
                            })
                          }
                          style={{ width: "100%" }}
                          fontSize={12}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <label style={fieldLabelStyle}>{certificationLabel}</label>
                        <CustomSelect
                          value={row.certificationId != null ? String(row.certificationId) : ""}
                          options={[
                            { value: "", label: "— None —" },
                            ...certifications.map((d) => ({
                              value: String(d.id),
                              label: d.name !== d.abbr ? `${d.name} (${d.abbr})` : d.name,
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

                    {/* Email (optional). Admins can leave blank to schedule
                      a new hire before they're onboarded; the invitation
                      flow fills it in later. */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={fieldLabelStyle}>
                        Email{" "}
                        <span style={{ fontWeight: 400, color: "var(--dg-color-text-muted)" }}>
                          (optional)
                        </span>
                      </label>
                      <input
                        className="dg-input"
                        type="email"
                        value={row.email}
                        onChange={(e) => updateRow(row._id, { email: e.target.value })}
                        placeholder="name@example.com"
                        style={errors.email ? { borderColor: "var(--dg-color-danger)" } : undefined}
                      />
                      {errors.email ? (
                        <div
                          role="alert"
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                          }}
                        >
                          {errors.email}
                        </div>
                      ) : null}
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
                          {focusAreaLabel}{" "}
                          <span style={{ color: "var(--dg-color-danger)" }}>*</span>
                        </label>
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-text-muted)",
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
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {focusArea.name}
                            </SelectableTag>
                          );
                        })}
                      </div>
                      {errors.focusAreaIds ? (
                        <div
                          role="alert"
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            color: "var(--dg-color-danger)",
                          }}
                        >
                          {errors.focusAreaIds}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
      {unsavedChangesDialog}
    </>
  );
}

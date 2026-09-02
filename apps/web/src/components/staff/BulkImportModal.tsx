"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle, Import as ImportIcon, XCircle } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Button } from "@/components/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { toast } from "sonner";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { thStyle } from "@/lib/styles";
import { MOBILE, useEmployees, useMediaQuery } from "@/hooks";
import {
  classifyRowAgainstExisting,
  type ExistingEmployeeLite,
  type RowDuplicateClassification,
} from "@/lib/employee-duplicate-detection";
import { getImportReferenceErrors } from "./import-reference-validation";
import type { FocusArea, NamedItem } from "@/types";

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  focusAreaNames: string;
  certificationName: string;
  roleNames: string;
  contactNotes: string;
}

interface ImportResult {
  success: boolean;
  inserted: number;
  errors: { row: number; error: string }[];
  total: number;
}

const EXPECTED_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "focus_areas",
  "certification",
  "roles",
  "notes",
];

const SAMPLE_CSV_ROWS = [
  ["John", "Doe", "john@example.com", "555-0100", "ER;ICU", "RN", "Charge Nurse", ""],
  ["Jane", "Smith", "jane@example.com", "555-0101", "ICU", "LPN", "", "Experienced"],
];

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2)
    return { rows: [], errors: ["File must have a header row and at least one data row"] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  // Validate at minimum first_name and last_name headers
  if (!headers.includes("first_name") || !headers.includes("last_name")) {
    return {
      rows: [],
      errors: [
        `CSV must include "first_name" and "last_name" columns. Found: ${headers.join(", ")}`,
      ],
    };
  }

  const idxFirst = headers.indexOf("first_name");
  const idxLast = headers.indexOf("last_name");
  const idxEmail = headers.indexOf("email");
  const idxPhone = headers.indexOf("phone");
  const idxFocus = headers.indexOf("focus_areas");
  const idxCert = headers.indexOf("certification");
  const idxRoles = headers.indexOf("roles");
  const idxNotes = headers.indexOf("notes");

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const firstName = fields[idxFirst]?.trim() ?? "";
    const lastName = fields[idxLast]?.trim() ?? "";

    if (!firstName && !lastName) continue; // skip blank rows

    if (!firstName) {
      errors.push(`Row ${i}: missing first_name`);
      continue;
    }
    if (!lastName) {
      errors.push(`Row ${i}: missing last_name`);
      continue;
    }

    rows.push({
      firstName,
      lastName,
      email: idxEmail >= 0 ? (fields[idxEmail]?.trim() ?? "") : "",
      phone: idxPhone >= 0 ? (fields[idxPhone]?.trim() ?? "") : "",
      focusAreaNames: idxFocus >= 0 ? (fields[idxFocus]?.trim() ?? "") : "",
      certificationName: idxCert >= 0 ? (fields[idxCert]?.trim() ?? "") : "",
      roleNames: idxRoles >= 0 ? (fields[idxRoles]?.trim() ?? "") : "",
      contactNotes: idxNotes >= 0 ? (fields[idxNotes]?.trim() ?? "") : "",
    });
  }

  return { rows, errors };
}

const PREVIEW_COLUMNS: {
  key: "name" | keyof ParsedRow;
  label: string;
  maxWidth?: number;
}[] = [
  { key: "name", label: "Name", maxWidth: 180 },
  { key: "email", label: "Email", maxWidth: 220 },
  { key: "phone", label: "Phone", maxWidth: 120 },
  { key: "focusAreaNames", label: "Focus Areas", maxWidth: 160 },
  { key: "certificationName", label: "Certification", maxWidth: 160 },
  { key: "roleNames", label: "Roles", maxWidth: 160 },
  { key: "contactNotes", label: "Notes", maxWidth: 200 },
];

function previewCellValue(row: ParsedRow, key: "name" | keyof ParsedRow): string {
  if (key === "name") return `${row.firstName} ${row.lastName}`;
  const value = row[key];
  return typeof value === "string" ? value : String(value);
}

// Rows can be flagged against a real DB employee ("existing") or against
// another row in the same CSV upload ("batch") — a CSV with two rows for the
// same (or a typo-similar) person has no DB constraint to catch it, since
// neither has been inserted yet.
type ClassificationSource = "existing" | "batch";

interface EnrichedClassification extends RowDuplicateClassification {
  source: ClassificationSource | null;
  batchRowIndex?: number;
}

function classificationTitle(classification: EnrichedClassification): string | undefined {
  if (!classification.match) return undefined;
  const { employee, reason } = classification.match;
  const name = `${employee.firstName} ${employee.lastName}`;
  const who =
    classification.source === "batch"
      ? `${name} (row ${(classification.batchRowIndex ?? 0) + 1} in this file)`
      : `existing employee ${name}`;
  if (classification.status === "blocked") {
    const reasonLabel = reason === "name" ? "name" : reason === "email" ? "email" : "phone";
    return `Duplicate of ${who} (matched by ${reasonLabel}) — will not be imported`;
  }
  return `Similar to ${who} — different contact info, double-check before importing`;
}

function classificationRowBackground(
  status: RowDuplicateClassification["status"],
): string | undefined {
  if (status === "blocked") return "var(--dg-color-danger-bg)";
  if (status === "warning") return "var(--dg-color-warning-bg)";
  return undefined;
}

function statusTitle(
  classification: EnrichedClassification,
  referenceErrors: string[],
): string | undefined {
  const duplicateTitle = classificationTitle(classification);
  return [...referenceErrors, duplicateTitle].filter(Boolean).join(" ") || undefined;
}

export function BulkImportModal({
  orgId,
  focusAreas,
  certifications,
  roles,
  onClose,
  onImported,
}: {
  orgId: string;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isMobile = useMediaQuery(MOBILE);
  const hasUnsavedChanges = step === "preview" && rows.length > 0;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });

  // Fetch independently rather than relying on a parent-provided employees
  // prop — callers like PeoplePageContent filter their own `employees` down
  // to "on schedule" staff (focusAreaIds.length > 0) for the directory view,
  // which would silently hide active employees with no focus area from
  // duplicate-checking. This hits the same React Query cache the rest of
  // the page already populated, so it's not an extra network round trip in
  // practice.
  const { employees, inactiveEmployees, removedEmployees } = useEmployees(orgId);

  // Employees in any status still occupy the DB's uniqueness slots (name,
  // email, phone are unique per org regardless of active/inactive/removed),
  // so all three lists must be checked, not just active employees.
  const existingLite: ExistingEmployeeLite[] = useMemo(
    () =>
      [...employees, ...inactiveEmployees, ...removedEmployees].map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
      })),
    [employees, inactiveEmployees, removedEmployees],
  );

  // Each row as an ExistingEmployeeLite so rows can also be checked against
  // each other — a CSV can contain its own internal duplicates before any of
  // it has been inserted, so the DB's constraints can't catch that case.
  const rowsAsLite: ExistingEmployeeLite[] = useMemo(
    () =>
      rows.map((r, i) => ({
        id: `row-${i}`,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
      })),
    [rows],
  );

  const classifications: EnrichedClassification[] = useMemo(
    () =>
      rows.map((row, i) => {
        const existingMatch = classifyRowAgainstExisting(row, existingLite);
        // "blocked" is already the strictest possible status — no need to
        // also check sibling rows, nothing could override it.
        if (existingMatch.status === "blocked") {
          return { ...existingMatch, source: "existing" };
        }

        const siblings = rowsAsLite.filter((_, j) => j !== i);
        const batchMatch = classifyRowAgainstExisting(row, siblings);
        if (batchMatch.status === "blocked" && batchMatch.match) {
          const batchRowIndex = Number(batchMatch.match.employee.id.replace("row-", ""));
          return { ...batchMatch, source: "batch", batchRowIndex };
        }

        // Neither source blocked this row — take a "warning" from either,
        // preferring the existing-employee one if both apply.
        if (existingMatch.status === "warning") {
          return { ...existingMatch, source: "existing" };
        }
        if (batchMatch.status === "warning" && batchMatch.match) {
          const batchRowIndex = Number(batchMatch.match.employee.id.replace("row-", ""));
          return { ...batchMatch, source: "batch", batchRowIndex };
        }

        return { status: "ok", match: null, source: null };
      }),
    [rows, existingLite, rowsAsLite],
  );

  const referenceErrorsByRow = useMemo(
    () =>
      rows.map((row) =>
        getImportReferenceErrors(row, {
          focusAreaNames: focusAreas.map((area) => area.name),
          certificationNames: certifications.map((certification) => certification.name),
          roleNames: roles.map((role) => role.name),
        }),
      ),
    [rows, focusAreas, certifications, roles],
  );

  const blockedCount = useMemo(
    () =>
      classifications.filter(
        (classification, index) =>
          classification.status === "blocked" || referenceErrorsByRow[index].length > 0,
      ).length,
    [classifications, referenceErrorsByRow],
  );
  const duplicateBlockedCount = useMemo(
    () => classifications.filter((classification) => classification.status === "blocked").length,
    [classifications],
  );
  const referenceBlockedRows = useMemo(
    () => referenceErrorsByRow.filter((errors) => errors.length > 0),
    [referenceErrorsByRow],
  );
  const warningCount = useMemo(
    () => classifications.filter((c) => c.status === "warning").length,
    [classifications],
  );
  const importableCount = rows.length - blockedCount;

  // Positions (into `rows`) of everything that isn't blocked — this is what
  // actually gets sent to the API. Kept around so server-side error row
  // numbers can be remapped back to what the admin saw in the preview table.
  const sendableIndices = useMemo(
    () =>
      rows
        .map((_, i) => i)
        .filter(
          (i) => classifications[i]?.status !== "blocked" && referenceErrorsByRow[i].length === 0,
        ),
    [rows, classifications, referenceErrorsByRow],
  );

  const handleRequestClose = useCallback(() => {
    if (importing) return;
    if (requestClose()) {
      onClose();
    }
  }, [importing, onClose, requestClose]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Choose a CSV file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows: parsed, errors } = parseCsv(text);
      setRows(parsed);
      setParseErrors(errors);
      if (parsed.length > 0) setStep("preview");
      else if (errors.length > 0) toast.error(errors[0]);
      else toast.error("No data rows found in CSV");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  async function handleImport() {
    if (importableCount === 0) return;
    setImporting(true);
    setSkippedDuplicates(blockedCount);
    try {
      const payloadRows = sendableIndices.map((i) => rows[i]);
      const res = await fetch("/api/import/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, rows: payloadRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(formatClientErrorMessage(data.error, "We couldn't import those employees."));
        return;
      }
      // `data.errors[].row` is positioned within `payloadRows` — remap back
      // to the row number the admin actually saw in the preview table.
      const remappedErrors = (data.errors ?? []).map((e: { row: number; error: string }) => ({
        ...e,
        row: sendableIndices[e.row - 1] + 1,
      }));
      setResult({ ...(data as ImportResult), errors: remappedErrors });
      setStep("result");
      if (data.inserted > 0) {
        toast.success(
          data.inserted === 1 ? "1 employee imported" : `${data.inserted} employees imported`,
        );
        onImported();
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  return createPortal(
    <div
      className="dg-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div
        className="dg-modal"
        style={{
          padding: 0,
          // Sized so each step's table fits without an inner horizontal
          // scrollbar: the upload step's 8-column CSV format sample and the
          // preview step's 9-column data table (both wider than the base
          // .dg-modal) each get enough room for their widest realistic
          // content.
          maxWidth: step === "preview" ? 1360 : 860,
          width: isMobile
            ? "calc(100vw - 32px)"
            : `min(${step === "preview" ? 1360 : 860}px, calc(100vw - 48px))`,
          maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 40px)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span className="dg-modal-title">
            {step === "upload" && "Import Employees"}
            {step === "preview" && `Preview (${rows.length} rows)`}
            {step === "result" && "Import Results"}
          </span>
          <CloseButton size="md" onClick={handleRequestClose} aria-label="Close import dialog" />
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          {step === "upload" && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragActive ? "var(--dg-color-border-focus)" : "var(--dg-color-border)"}`,
                  borderRadius: "var(--dg-radius-md)",
                  padding: "48px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  background: isDragActive ? "var(--dg-color-bg-secondary)" : "transparent",
                  transition:
                    "border-color var(--dg-duration-fast) ease, background var(--dg-duration-fast) ease",
                }}
              >
                <ImportIcon
                  size={32}
                  style={{
                    color: isDragActive
                      ? "var(--dg-color-border-focus)"
                      : "var(--dg-color-text-muted)",
                  }}
                />
                <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--dg-fs-body)" }}>
                  Drop CSV file here or click to browse
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  Max 500 rows, 2MB
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              <div style={{ marginTop: 20 }}>
                <div className="dg-modal-section-label" style={{ marginBottom: 8 }}>
                  EXPECTED CSV FORMAT
                </div>
                <div
                  style={{
                    border: "1px solid var(--dg-color-border)",
                    borderRadius: "var(--dg-radius-md)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "var(--dg-fs-footnote)",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "var(--dg-color-bg)" }}>
                          {EXPECTED_HEADERS.map((header) => (
                            <th
                              key={header}
                              style={{
                                ...thStyle,
                                padding: "6px 10px",
                                borderBottom: "1px solid var(--dg-color-border)",
                              }}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {SAMPLE_CSV_ROWS.map((row, i) => (
                          <tr key={`sample-${row[2]}`}>
                            {row.map((cell, j) => (
                              <td
                                key={`sample-${row[2]}-${EXPECTED_HEADERS[j]}`}
                                style={{
                                  padding: "6px 10px",
                                  whiteSpace: "nowrap",
                                  color: "var(--dg-color-text-secondary)",
                                  borderBottom:
                                    i === SAMPLE_CSV_ROWS.length - 1
                                      ? "none"
                                      : "1px solid var(--dg-color-border-light)",
                                }}
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  Separate multiple focus areas or roles with semicolons (;). Names must match
                  existing org configuration.
                </p>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div>
              {(blockedCount > 0 || warningCount > 0) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {blockedCount > 0 && (
                    <div
                      style={{
                        padding: 12,
                        background: "var(--dg-color-danger-bg)",
                        border: "1px solid var(--dg-color-danger-border)",
                        borderRadius: "var(--dg-radius-md)",
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-danger-text)",
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <XCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div>
                          {importableCount} of {rows.length} row{rows.length !== 1 ? "s" : ""} will
                          be imported. {blockedCount} row{blockedCount !== 1 ? "s" : ""} blocked.
                          {duplicateBlockedCount > 0 &&
                            ` ${duplicateBlockedCount} duplicate${duplicateBlockedCount !== 1 ? "s" : ""} of existing employees.`}
                        </div>
                        {referenceBlockedRows.length > 0 && (
                          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                            {referenceErrorsByRow.flatMap((errors, index) =>
                              errors.map((error) => (
                                <li key={`${index}-${error}`}>
                                  Row {index + 1}: {error}
                                </li>
                              )),
                            )}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div
                      style={{
                        padding: 12,
                        background: "var(--dg-color-warning-bg)",
                        border: "1px solid var(--dg-color-warning-border)",
                        borderRadius: "var(--dg-radius-md)",
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-warning-text)",
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>
                        {warningCount} row{warningCount !== 1 ? "s" : ""}{" "}
                        {warningCount !== 1 ? "look" : "looks"} similar to existing employees —
                        review before importing.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {parseErrors.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--dg-color-warning-bg)",
                    border: "1px solid var(--dg-color-warning-border)",
                    borderRadius: "var(--dg-radius-md)",
                    marginBottom: 16,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-warning-text)",
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <strong>{parseErrors.length} warning(s):</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                      {parseErrors.slice(0, 5).map((e, i) => (
                        <li key={`parse-${i}-${e.slice(0, 30)}`}>{e}</li>
                      ))}
                      {parseErrors.length > 5 && <li>...and {parseErrors.length - 5} more</li>}
                    </ul>
                  </div>
                </div>
              )}

              <div
                style={{
                  border: "1px solid var(--dg-color-border)",
                  borderRadius: "var(--dg-radius-md)",
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "var(--dg-fs-caption)",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "var(--dg-color-bg)" }}>
                        <th
                          style={{
                            ...thStyle,
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--dg-color-border)",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            ...thStyle,
                            padding: "8px 12px",
                            borderBottom: "1px solid var(--dg-color-border)",
                          }}
                        >
                          Status
                        </th>
                        {PREVIEW_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            style={{
                              ...thStyle,
                              padding: "8px 12px",
                              borderBottom: "1px solid var(--dg-color-border)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 20).map((row, i) => {
                        const classification = classifications[i];
                        const referenceErrors = referenceErrorsByRow[i];
                        const isBlocked =
                          classification.status === "blocked" || referenceErrors.length > 0;
                        const isLastRow = i === Math.min(rows.length, 20) - 1;
                        const borderBottom = isLastRow
                          ? "none"
                          : "1px solid var(--dg-color-border-light)";
                        return (
                          <tr
                            key={`preview-${row.firstName}-${row.lastName}-${i}`}
                            style={{
                              background: isBlocked
                                ? classificationRowBackground("blocked")
                                : classificationRowBackground(classification.status),
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 12px",
                                borderBottom,
                                color: "var(--dg-color-text-muted)",
                              }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{ padding: "8px 12px", borderBottom }}
                              title={statusTitle(classification, referenceErrors)}
                            >
                              {isBlocked && (
                                <XCircle
                                  size={16}
                                  style={{ color: "var(--dg-color-danger-text)" }}
                                />
                              )}
                              {classification.status === "warning" && (
                                <AlertTriangle
                                  size={16}
                                  style={{ color: "var(--dg-color-warning-text)" }}
                                />
                              )}
                            </td>
                            {PREVIEW_COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                title={col.maxWidth ? previewCellValue(row, col.key) : undefined}
                                style={{
                                  padding: "8px 12px",
                                  borderBottom,
                                  color:
                                    col.key === "name" ? undefined : "var(--dg-color-text-muted)",
                                  ...(col.maxWidth
                                    ? {
                                        maxWidth: col.maxWidth,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }
                                    : { whiteSpace: "nowrap" }),
                                }}
                              >
                                {previewCellValue(row, col.key) || "—"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {rows.length > 20 && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  Showing first 20 of {rows.length} rows
                </p>
              )}
            </div>
          )}

          {step === "result" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                  background:
                    result.inserted > 0
                      ? "var(--dg-color-success-bg)"
                      : "var(--dg-color-danger-bg)",
                  border: `1px solid ${result.inserted > 0 ? "var(--dg-color-success-border)" : "var(--dg-color-danger-border)"}`,
                  borderRadius: "var(--dg-radius-lg)",
                }}
              >
                {result.inserted > 0 ? (
                  <CheckCircle
                    size={24}
                    style={{ flexShrink: 0, color: "var(--dg-color-success-text)" }}
                  />
                ) : (
                  <AlertTriangle
                    size={24}
                    style={{ flexShrink: 0, color: "var(--dg-color-danger)" }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--dg-fs-body)" }}>
                    {result.inserted} of {result.total} employees imported
                  </div>
                  {(result.errors.length > 0 || skippedDuplicates > 0) && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {result.errors.length > 0 && `${result.errors.length} error(s)`}
                      {result.errors.length > 0 && skippedDuplicates > 0 && " · "}
                      {skippedDuplicates > 0 &&
                        `${skippedDuplicates} duplicate row(s) skipped before import`}
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--dg-color-danger-bg)",
                    border: "1px solid var(--dg-color-danger-border)",
                    borderRadius: "var(--dg-radius-md)",
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-danger-text)",
                  }}
                >
                  <strong>Errors:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                    {result.errors.slice(0, 10).map((e) => (
                      <li key={`err-${e.row}`}>
                        Row {e.row}: {e.error}
                      </li>
                    ))}
                    {result.errors.length > 10 && <li>...and {result.errors.length - 10} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="dg-modal-actions"
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--dg-color-border)",
            flexShrink: 0,
          }}
        >
          {step === "preview" && (
            <>
              <Button
                className="dg-btn dg-btn-secondary"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setParseErrors([]);
                }}
              >
                Back
              </Button>
              <Button
                className="dg-btn dg-btn-primary"
                onClick={handleImport}
                disabled={importing || importableCount === 0}
              >
                <ButtonLoading
                  loading={importing}
                  spinnerColor="var(--dg-color-text-inverse)"
                  spinnerSize={16}
                >
                  <ImportIcon size={14} style={{ marginRight: 4 }} />
                  Import {importableCount} Employee{importableCount !== 1 ? "s" : ""}
                </ButtonLoading>
              </Button>
            </>
          )}
          {step === "result" && (
            <Button className="dg-btn dg-btn-primary" onClick={onClose}>
              Done
            </Button>
          )}
          {step === "upload" && (
            <Button className="dg-btn dg-btn-secondary" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </Button>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
      {unsavedChangesDialog}
    </div>,
    document.body,
  );
}

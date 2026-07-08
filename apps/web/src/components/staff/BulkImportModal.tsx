"use client";

import { useState, useCallback, useRef } from "react";
import { AlertTriangle, CheckCircle, Import as ImportIcon, X } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { formatClientErrorMessage } from "@/lib/client-facing";

interface ParsedRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  seniority: number;
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
  "seniority",
  "focus_areas",
  "certification",
  "roles",
  "notes",
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
  const idxSeniority = headers.indexOf("seniority");
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
      seniority: idxSeniority >= 0 ? parseInt(fields[idxSeniority]) || 0 : 0,
      focusAreaNames: idxFocus >= 0 ? (fields[idxFocus]?.trim() ?? "") : "",
      certificationName: idxCert >= 0 ? (fields[idxCert]?.trim() ?? "") : "",
      roleNames: idxRoles >= 0 ? (fields[idxRoles]?.trim() ?? "") : "",
      contactNotes: idxNotes >= 0 ? (fields[idxNotes]?.trim() ?? "") : "",
    });
  }

  return { rows, errors };
}

export function BulkImportModal({
  orgId,
  onClose,
  onImported,
}: {
  orgId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasUnsavedChanges = step === "preview" && rows.length > 0;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges,
    onDiscard: onClose,
  });

  const handleRequestClose = useCallback(() => {
    if (importing) return;
    if (requestClose()) {
      onClose();
    }
  }, [importing, onClose, requestClose]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
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
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/import/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(formatClientErrorMessage(data.error, "We couldn't import those employees."));
        return;
      }
      setResult(data as ImportResult);
      setStep("result");
      if (data.inserted > 0) onImported();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--dg-overlay)",
        backdropFilter: "blur(var(--dg-overlay-blur))",
        WebkitBackdropFilter: "blur(var(--dg-overlay-blur))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--dg-radius-xl)",
          boxShadow: "var(--shadow-overlay)",
          width: "100%",
          maxWidth: 640,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "var(--dg-fs-title)" }}>
            {step === "upload" && "Import Employees"}
            {step === "preview" && `Preview (${rows.length} rows)`}
            {step === "result" && "Import Results"}
          </span>
          <button
            onClick={handleRequestClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          {step === "upload" && (
            <div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: "2px dashed var(--color-border)",
                  borderRadius: "var(--dg-radius-md)",
                  padding: "48px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <ImportIcon size={32} style={{ color: "var(--color-text-muted)" }} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--dg-fs-body)" }}>
                  Drop CSV file here or click to browse
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--color-text-muted)",
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

              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  background: "var(--color-bg)",
                  borderRadius: "var(--dg-radius-lg)",
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--color-text-muted)",
                }}
              >
                <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Expected CSV format:</p>
                <code
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    display: "block",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {EXPECTED_HEADERS.join(",")}
                  {"\n"}
                  John,Doe,john@example.com,555-0100,1,ER;ICU,RN,Charge Nurse,{"\n"}
                  Jane,Smith,jane@example.com,555-0101,2,ICU,LPN,,Experienced
                </code>
                <p style={{ margin: "8px 0 0", fontSize: "var(--dg-fs-footnote)" }}>
                  Separate multiple focus areas or roles with semicolons (;). Names must match
                  existing org configuration.
                </p>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div>
              {parseErrors.length > 0 && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--color-warning-bg)",
                    borderRadius: "var(--dg-radius-md)",
                    marginBottom: 16,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--color-warning-text)",
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

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "var(--dg-fs-caption)",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          padding: "6px 8px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          fontWeight: 600,
                        }}
                      >
                        #
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          fontWeight: 600,
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          fontWeight: 600,
                        }}
                      >
                        Email
                      </th>
                      <th
                        style={{
                          padding: "6px 8px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          fontWeight: 600,
                        }}
                      >
                        Focus Areas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={`preview-${row.firstName}-${row.lastName}-${i}`}>
                        <td
                          style={{
                            padding: "6px 8px",
                            borderBottom: "1px solid var(--color-border-light)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {i + 1}
                        </td>
                        <td
                          style={{
                            padding: "6px 8px",
                            borderBottom: "1px solid var(--color-border-light)",
                          }}
                        >
                          {row.firstName} {row.lastName}
                        </td>
                        <td
                          style={{
                            padding: "6px 8px",
                            borderBottom: "1px solid var(--color-border-light)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {row.email || "—"}
                        </td>
                        <td
                          style={{
                            padding: "6px 8px",
                            borderBottom: "1px solid var(--color-border-light)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {row.focusAreaNames || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Showing first 20 of {rows.length} rows
                  </p>
                )}
              </div>
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
                    result.inserted > 0 ? "var(--color-success-bg)" : "var(--color-danger-bg)",
                  borderRadius: "var(--dg-radius-lg)",
                }}
              >
                {result.inserted > 0 ? (
                  <CheckCircle size={24} style={{ color: "var(--color-success-text)" }} />
                ) : (
                  <AlertTriangle size={24} style={{ color: "var(--color-danger)" }} />
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--dg-fs-body)" }}>
                    {result.inserted} of {result.total} employees imported
                  </div>
                  {result.errors.length > 0 && (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--color-text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {result.errors.length} error(s)
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div style={{ fontSize: "var(--dg-fs-caption)" }}>
                  <strong>Errors:</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20, color: "var(--color-danger)" }}>
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
          style={{
            padding: "12px 24px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {step === "preview" && (
            <>
              <button
                className="dg-btn dg-btn-secondary"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setParseErrors([]);
                }}
              >
                Back
              </button>
              <button className="dg-btn dg-btn-primary" onClick={handleImport} disabled={importing}>
                <ButtonLoading
                  loading={importing}
                  spinnerColor="var(--color-text-inverse)"
                  spinnerSize={16}
                >
                  <ImportIcon size={14} style={{ marginRight: 4 }} />
                  Import {rows.length} Employee{rows.length !== 1 ? "s" : ""}
                </ButtonLoading>
              </button>
            </>
          )}
          {step === "result" && (
            <button className="dg-btn dg-btn-primary" onClick={onClose}>
              Done
            </button>
          )}
          {step === "upload" && (
            <button className="dg-btn dg-btn-secondary" onClick={handleRequestClose}>
              {EDITOR_ACTION_LABELS.close}
            </button>
          )}
        </div>
      </div>
      {unsavedChangesDialog}
    </div>
  );
}

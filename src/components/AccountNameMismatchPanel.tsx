"use client";

import type { CSSProperties } from "react";
import { ButtonLoading } from "@/components/ButtonSpinner";
import type { NameMismatchDetails } from "@/types";

interface AccountNameMismatchPanelProps {
  details: NameMismatchDetails;
  title: string;
  description: string;
  confirmLabel: string;
  dismissLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

function formatName(firstName: string, lastName: string): string {
  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  return fullName || "No name on file";
}

export function AccountNameMismatchPanel({
  details,
  title,
  description,
  confirmLabel,
  dismissLabel = "Close",
  onCancel,
  onConfirm,
  confirming = false,
}: AccountNameMismatchPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          padding: "16px",
          background: "var(--color-info-bg)",
          borderRadius: 8,
          border: "1px solid var(--color-info-border)",
        }}
      >
        <p style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", fontWeight: 600, color: "var(--color-info-text)" }}>
          {title}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "var(--dg-fs-label)", color: "var(--color-info-text)" }}>
          {description}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          <div style={labelStyle}>Employee record</div>
          <div style={nameStyle}>{formatName(details.employeeFirstName, details.employeeLastName)}</div>
        </div>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-light)",
          }}
        >
          <div style={labelStyle}>User account</div>
          <div style={nameStyle}>{formatName(details.accountFirstName, details.accountLastName)}</div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
        Selecting {`"${confirmLabel}"`} will update the employee record to match the user account name. The account profile itself will not be changed.
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="dg-btn dg-btn-ghost" onClick={onCancel}>
          {dismissLabel}
        </button>
        <button
          className="dg-btn dg-btn-primary"
          onClick={onConfirm}
          disabled={confirming}
          style={{ opacity: confirming ? 0.5 : 1 }}
        >
          <ButtonLoading loading={confirming} spinnerSize={16}>
            {confirmLabel}
          </ButtonLoading>
        </button>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: "var(--dg-fs-footnote)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const nameStyle: CSSProperties = {
  fontSize: "var(--dg-fs-body-sm)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};

import type { ReactNode } from "react";

// Shared presentational helpers for the OrganizationDetail tabs.

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "active"
      ? "var(--dg-color-success)"
      : status === "inactive"
        ? "var(--dg-color-warning)"
        : "var(--dg-color-danger)";
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 500,
      }}
    >
      <span
        style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
      />
      <span style={{ textTransform: "capitalize", color: "var(--dg-color-text-secondary)" }}>
        {status}
      </span>
    </span>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 600,
          color: "var(--dg-color-text-subtle)",
          minWidth: 120,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "var(--dg-fs-label)", color: "var(--dg-color-text-primary)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "12px 16px",
        background: "var(--dg-color-bg)",
        borderRadius: "var(--dg-radius-md)",
        minWidth: 80,
      }}
    >
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 700,
          color: "var(--dg-color-text-primary)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

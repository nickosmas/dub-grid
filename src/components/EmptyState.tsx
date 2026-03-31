"use client";

import type { CSSProperties, ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: CSSProperties;
}

/**
 * Generic empty state component for pages/sections with no data.
 * Provides consistent visual treatment across the app.
 */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "64px 24px",
        textAlign: "center",
        background: "var(--color-surface)",
        borderRadius: 14,
        border: "1px dashed var(--color-border)",
        color: "var(--color-text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            color: "var(--color-text-faint)",
            background: "var(--color-bg)",
            padding: 20,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-raised)",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          {title}
        </div>
        {description && (
          <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", maxWidth: 400 }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

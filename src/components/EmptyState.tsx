"use client";

import type { CSSProperties, ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Compact variant for use inside cards/sections with less padding and smaller text */
  compact?: boolean;
  style?: CSSProperties;
}

/**
 * Generic empty state component for pages/sections with no data.
 * Provides consistent visual treatment across the app.
 *
 * - Default: full-page empty state with large padding, icon circle, dashed border
 * - Compact: smaller padding and text for use inside cards or settings sections
 */
export function EmptyState({ icon, title, description, action, compact, style }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: compact ? "32px 16px" : "64px 24px",
        textAlign: "center",
        background: "var(--color-surface)",
        borderRadius: compact ? 10 : 14,
        border: "1px dashed var(--color-border)",
        color: "var(--color-text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 10 : 16,
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            color: "var(--color-text-faint)",
            background: "var(--color-bg)",
            padding: compact ? 12 : 20,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: compact ? undefined : "var(--shadow-raised)",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: compact ? "var(--dg-fs-body)" : "var(--dg-fs-heading)", fontWeight: compact ? 600 : 700, color: "var(--color-text-primary)" }}>
          {title}
        </div>
        {description && (
          <p style={{ margin: 0, fontSize: "var(--dg-fs-label)", color: "var(--color-text-muted)", maxWidth: 400 }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: compact ? 4 : 8 }}>{action}</div>}
    </div>
  );
}

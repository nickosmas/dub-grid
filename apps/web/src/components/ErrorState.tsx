"use client";

import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ReactNode;
  compact?: boolean;
  style?: CSSProperties;
}

/**
 * Standardised error state for pages/sections that failed to load.
 * Mirrors the visual language of EmptyState but with an alert role
 * so screen readers announce it immediately.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  icon,
  compact,
  style,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        padding: compact ? "32px 16px" : "64px 24px",
        textAlign: "center",
        background: "var(--color-surface)",
        borderRadius: compact ? 10 : 14,
        border: "1px solid var(--color-danger-border, var(--color-border))",
        color: "var(--color-text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 10 : 16,
        ...style,
      }}
    >
      <div
        style={{
          color: "var(--color-danger)",
          background: "var(--color-danger-bg, #fef2f2)",
          padding: compact ? 12 : 20,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon ?? <AlertTriangle size={compact ? 20 : 28} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: compact ? "var(--dg-fs-body)" : "var(--dg-fs-heading)",
            fontWeight: compact ? 600 : 700,
            color: "var(--color-text-primary)",
          }}
        >
          {title}
        </div>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-label)",
              color: "var(--color-text-muted)",
              maxWidth: 400,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <div style={{ marginTop: compact ? 4 : 8 }}>
          <button onClick={onRetry} className="dg-btn dg-btn-primary">
            {retryLabel}
          </button>
        </div>
      )}
    </div>
  );
}

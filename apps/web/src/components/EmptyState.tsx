"use client";

import type { CSSProperties, ReactNode } from "react";

type EmptyStateSize = "default" | "compact" | "inline";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  heading?: string;
  description?: string;
  action?: ReactNode;
  /**
   * - default: full-page empty state with large padding (64px) and heading-sized title
   * - compact: smaller padding (32px) for cards/settings panels with body-sized title
   * - inline: tightest variant (24px) for dashboard tiles with label-sized title
   */
  size?: EmptyStateSize;
  style?: CSSProperties;
  "data-testid"?: string;
}

const PADDING: Record<EmptyStateSize, string> = {
  default: "64px 24px",
  compact: "32px 16px",
  inline: "24px 16px",
};

const RADIUS: Record<EmptyStateSize, number> = {
  default: 14,
  compact: 10,
  inline: 10,
};

const OUTER_GAP: Record<EmptyStateSize, number> = {
  default: 16,
  compact: 10,
  inline: 8,
};

const ICON_PADDING: Record<EmptyStateSize, number> = {
  default: 20,
  compact: 12,
  inline: 8,
};

export function EmptyState({
  icon,
  title,
  heading,
  description,
  action,
  size = "default",
  style,
  "data-testid": dataTestId,
}: EmptyStateProps) {
  const headingText = heading ?? title;

  const titleFontSize =
    size === "default"
      ? "var(--dg-fs-heading)"
      : size === "compact"
        ? "var(--dg-fs-body)"
        : "var(--dg-fs-label)";
  const titleFontWeight = 600;

  return (
    <div
      data-testid={dataTestId}
      style={{
        padding: PADDING[size],
        textAlign: "center",
        background: "var(--dg-color-surface)",
        borderRadius: RADIUS[size],
        border: "1px dashed var(--dg-color-border)",
        color: "var(--dg-color-text-muted)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: OUTER_GAP[size],
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            color: "var(--dg-color-text-faint)",
            background: "var(--dg-color-bg)",
            padding: ICON_PADDING[size],
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: size === "default" ? "var(--shadow-raised)" : undefined,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: titleFontWeight,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {headingText}
        </div>
        {description && (
          <p
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-muted)",
              maxWidth: 400,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: size === "default" ? 8 : 4 }}>{action}</div>}
    </div>
  );
}

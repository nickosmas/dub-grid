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

// An empty state stands in for the list it replaces, so it holds about that
// much room. A tighter parent can still shrink it through `style`.
const MIN_HEIGHT: Record<EmptyStateSize, number> = {
  default: 360,
  compact: 240,
  inline: 140,
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
      className="dg-empty-state"
      style={{
        boxSizing: "border-box",
        flex: "1 1 auto",
        alignSelf: "stretch",
        minHeight: MIN_HEIGHT[size],
        padding: PADDING[size],
        border: "1px dashed var(--dg-color-border)",
        borderRadius: "var(--dg-radius-md)",
        textAlign: "center",
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
            background: "var(--dg-color-bg-secondary)",
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
              textWrap: "balance",
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

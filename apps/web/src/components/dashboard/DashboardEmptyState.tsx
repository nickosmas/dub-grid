import type { CSSProperties, ReactNode } from "react";

type DashboardEmptyStateVariant = "panel" | "inline";

interface DashboardEmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  variant?: DashboardEmptyStateVariant;
  minHeight?: number;
  style?: CSSProperties;
}

export default function DashboardEmptyState({
  title,
  description,
  icon,
  variant = "inline",
  minHeight,
  style,
}: DashboardEmptyStateProps) {
  const isPanel = variant === "panel";

  return (
    <div
      style={{
        padding: isPanel ? "32px 20px" : "24px 16px",
        background: "var(--color-bg)",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--dg-radius-md)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: icon ? (isPanel ? 12 : 8) : 0,
        minHeight,
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: isPanel ? 44 : 36,
            height: isPanel ? 44 : 36,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-subtle)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: title && description ? (isPanel ? 4 : 2) : 0 }}>
        {title && (
          <div
            style={{
              fontSize: isPanel ? 15 : 12,
              fontWeight: isPanel ? 600 : 500,
              color: isPanel ? "var(--color-text-primary)" : "var(--color-text-subtle)",
            }}
          >
            {title}
          </div>
        )}
        {description && (
          <div
            style={{
              fontSize: isPanel ? 12 : 11,
              lineHeight: isPanel ? 1.5 : 1.45,
              color: "var(--color-text-subtle)",
              maxWidth: isPanel ? 300 : 360,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import type { ActivityItem, ActivityIconVariant } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

const ICON_STYLES: Record<ActivityIconVariant, { bg: string; stroke: string }> = {
  success: { bg: "var(--color-success-bg)", stroke: "var(--color-success-text)" },
  danger: { bg: "var(--color-danger-bg)", stroke: "var(--color-danger)" },
  warning: { bg: "var(--color-warning-bg)", stroke: "var(--color-warning)" },
  neutral: { bg: "var(--color-bg-secondary)", stroke: "var(--color-text-secondary)" },
};

function ActivityIcon({ variant }: { variant: ActivityIconVariant }) {
  const style = ICON_STYLES[variant];

  const icons: Record<ActivityIconVariant, React.ReactNode> = {
    success: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={style.stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7l3.5 3.5L12 3" />
      </svg>
    ),
    danger: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={style.stroke} strokeWidth="1.4" strokeLinecap="round">
        <path d="M7 4v4M7 10v.5" />
        <circle cx="7" cy="7" r="6" />
      </svg>
    ),
    warning: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={style.stroke} strokeWidth="1.4" strokeLinecap="round">
        <path d="M7 2v3M7 9v3M2 7h3M9 7h3" />
      </svg>
    ),
    neutral: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={style.stroke} strokeWidth="1.4" strokeLinecap="round">
        <path d="M2 4h10M2 7h7M2 10h5" />
      </svg>
    ),
  };

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: style.bg,
      }}
    >
      {icons[variant]}
    </div>
  );
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxVisible?: number;
  onExpand?: () => void;
  defaultCollapsed?: boolean;
}

export default function ActivityFeed({
  items,
  maxVisible = 8,
  onExpand,
  defaultCollapsed = false,
}: ActivityFeedProps) {
  const hasUrgentItems = items.some((i) => i.iconVariant === "danger" || i.iconVariant === "warning");
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !hasUrgentItems);
  const visible = items.slice(0, maxVisible);

  return (
    <div className="dg-card">
      <div
        className="dg-card-header"
        style={defaultCollapsed ? { cursor: "pointer" } : undefined}
        onClick={defaultCollapsed ? () => setCollapsed((c) => !c) : undefined}
      >
        <div>
          <div className="dg-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Recent activity
            {collapsed && items.length > 0 && (
              <span
                style={{
                  fontSize: "var(--dg-fs-micro)",
                  fontWeight: 500,
                  color: "var(--color-text-subtle)",
                }}
              >
                {items.length} event{items.length !== 1 ? "s" : ""}
              </span>
            )}
            {defaultCollapsed && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--color-text-subtle)",
                  transition: "transform 0.15s",
                  transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                  display: "inline-block",
                }}
              >
                &#9660;
              </span>
            )}
          </div>
          {!collapsed && (
            <div className="dg-card-subtitle">
              Latest events
            </div>
          )}
        </div>
        {!collapsed && onExpand && (
          <div onClick={(e) => e.stopPropagation()}>
            <ExpandButton onClick={onExpand} label="Expand activity" />
          </div>
        )}
      </div>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visible.length === 0 ? (
            <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center" }}>
              No recent activity
            </div>
          ) : (
            visible.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 18px",
                  borderBottom:
                    i < visible.length - 1
                      ? "1px solid var(--color-bg)"
                      : "none",
                }}
              >
                <ActivityIcon variant={item.iconVariant} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.description}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-subtle)",
                      marginTop: 2,
                    }}
                  >
                    {item.relativeTime}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

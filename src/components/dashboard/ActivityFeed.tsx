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

function EmptyActivityState() {
  return (
    <div
      style={{
        padding: "32px 20px",
        background: "var(--color-bg)",
        border: "1px dashed var(--color-border)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 12,
        minHeight: 134,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-subtle)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="6.5" strokeDasharray="1.5 3" />
        </svg>
      </div>

      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          No recent activity
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--color-text-subtle)",
            maxWidth: 300,
          }}
        >
          Published updates, shift changes, requests, and new user sign-ups will appear here.
        </div>
      </div>
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
  maxVisible = 5,
  onExpand,
  defaultCollapsed = false,
}: ActivityFeedProps) {
  const hasUrgentItems = items.some((i) => i.iconVariant === "danger" || i.iconVariant === "warning");
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !hasUrgentItems);
  const visible = items.slice(0, maxVisible);
  const remainingCount = Math.max(0, items.length - visible.length);

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
        <div style={{ display: "flex", flexDirection: "column", padding: "12px 16px 16px" }}>
          {visible.length === 0 ? (
            <EmptyActivityState />
          ) : (
            <>
              {visible.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom:
                      i < visible.length - 1 || remainingCount > 0
                        ? "1px solid var(--color-border-light)"
                        : "none",
                  }}
                >
                  <ActivityIcon variant={item.iconVariant} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.35,
                      }}
                    >
                      {item.description}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-subtle)",
                        marginTop: 3,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {item.relativeTime}
                    </div>
                  </div>
                </div>
              ))}
              {remainingCount > 0 && (
                <div
                  style={{
                    paddingTop: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-subtle)",
                  }}
                >
                  {remainingCount} more
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

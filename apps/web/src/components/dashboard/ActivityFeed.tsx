import { useState } from "react";
import Link from "next/link";
import type { ActivityItem, ActivityIconVariant } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";
import { EmptyState } from "@/components/EmptyState";

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
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke={style.stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 7l3.5 3.5L12 3" />
      </svg>
    ),
    danger: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke={style.stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M7 4v4M7 10v.5" />
        <circle cx="7" cy="7" r="6" />
      </svg>
    ),
    warning: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke={style.stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M7 2v3M7 9v3M2 7h3M9 7h3" />
      </svg>
    ),
    neutral: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke={style.stroke}
        strokeWidth="1.4"
        strokeLinecap="round"
      >
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
    <EmptyState
      size="compact"
      style={{ minHeight: 134 }}
      title="No recent activity"
      description="Published updates, shift changes, requests, and new user sign-ups will appear here."
    />
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
  const hasUrgentItems = items.some(
    (i) => i.iconVariant === "danger" || i.iconVariant === "warning",
  );
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
          {!collapsed && <div className="dg-card-subtitle">Latest events</div>}
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
                <Link
                  key={item.id}
                  href={item.href}
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div
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
                </Link>
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

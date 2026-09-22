import { useState } from "react";
import Link from "next/link";
import type { ActivityItem } from "@/lib/dashboard-stats";
import { ActivityIcon } from "./ActivityIcon";
import ExpandButton from "./ExpandButton";
import { EmptyState } from "@/components/EmptyState";

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
                  color: "var(--dg-color-text-subtle)",
                }}
              >
                {items.length} event{items.length !== 1 ? "s" : ""}
              </span>
            )}
            {defaultCollapsed && (
              <span
                style={{
                  fontSize: "var(--dg-type-metadata-size)",
                  color: "var(--dg-color-text-subtle)",
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
                          ? "1px solid var(--dg-color-border-light)"
                          : "none",
                    }}
                  >
                    <ActivityIcon kind={item.iconKind} variant={item.iconVariant} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--dg-color-text-secondary)",
                          lineHeight: 1.35,
                        }}
                      >
                        {item.description}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-type-metadata-size)",
                          color: "var(--dg-color-text-subtle)",
                          marginTop: 3,
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
                    fontSize: "var(--dg-type-metadata-size)",
                    fontWeight: 600,
                    color: "var(--dg-color-text-subtle)",
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

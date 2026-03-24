import type { ActivityItem, ActivityIconVariant } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

const ICON_STYLES: Record<ActivityIconVariant, { bg: string; stroke: string }> = {
  success: { bg: "#F0FDF4", stroke: "#2D6B3A" },
  danger: { bg: "#FEF2F2", stroke: "#DC2626" },
  warning: { bg: "#FFFBEB", stroke: "#D97706" },
  neutral: { bg: "var(--color-bg-secondary, #F1F5F9)", stroke: "var(--color-text-secondary, #495057)" },
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
}

export default function ActivityFeed({
  items,
  maxVisible = 8,
  onExpand,
}: ActivityFeedProps) {
  const visible = items.slice(0, maxVisible);

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Recent activity
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 1 }}>
            Latest events
          </div>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} label="Expand activity" />}
      </div>

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
                    ? "1px solid var(--color-bg, #F8FAFC)"
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
    </div>
  );
}

const cardStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  overflow: "hidden" as const,
};

const headerStyle = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--color-border-light, #E2E8F0)",
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
};

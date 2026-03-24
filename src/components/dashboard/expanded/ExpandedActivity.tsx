import { useState, useMemo } from "react";
import type { ActivityItem, ActivityIconVariant, OTAlert } from "@/lib/dashboard-stats";
import { buildActivityFeed } from "@/lib/dashboard-stats";
import type { PublishHistoryEntry, ShiftRequest } from "@/types";
import Modal from "@/components/Modal";

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
        width: 30,
        height: 30,
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

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "publish", label: "Published" },
  { value: "shift_change", label: "Shift changes" },
  { value: "ot_alert", label: "OT alerts" },
] as const;

interface ExpandedActivityProps {
  publishHistory: PublishHistoryEntry | null;
  shiftRequests: ShiftRequest[];
  otAlerts: OTAlert[];
  onClose: () => void;
}

export default function ExpandedActivity({
  publishHistory,
  shiftRequests,
  otAlerts,
  onClose,
}: ExpandedActivityProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const allItems = useMemo(
    () => buildActivityFeed(publishHistory, shiftRequests, otAlerts, 100),
    [publishHistory, shiftRequests, otAlerts],
  );

  const filtered = useMemo(
    () => (typeFilter === "all" ? allItems : allItems.filter((item) => item.type === typeFilter)),
    [allItems, typeFilter],
  );

  return (
    <Modal title="Recent activity" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Type filter tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: active ? "var(--color-primary, #2D6B3A)" : "var(--color-border)",
                  background: active ? "var(--color-primary, #2D6B3A)" : "transparent",
                  color: active ? "#fff" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {f.label}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "var(--color-text-subtle)", marginLeft: "auto", alignSelf: "center" }}>
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Feed list */}
        <div style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {filtered.length === 0 ? (
            <div style={emptyStyle}>No activity matching filter</div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "11px 4px",
                  borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border-light, #E2E8F0)" : "none",
                }}
              >
                <ActivityIcon variant={item.iconVariant} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 3 }}>
                    {item.timestamp} &middot; {item.relativeTime}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};

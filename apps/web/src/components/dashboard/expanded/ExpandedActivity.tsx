import { useState, useMemo } from "react";
import Link from "next/link";
import type { ActivityIconVariant, ActivityItem } from "@/lib/dashboard-stats";
import Modal from "@/components/Modal";
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
  { value: "request", label: "Requests" },
  { value: "user_signup", label: "User sign-ups" },
] as const;

interface ExpandedActivityProps {
  items: ActivityItem[];
  onClose: () => void;
}

export default function ExpandedActivity({
  items,
  onClose,
}: ExpandedActivityProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = useMemo(
    () => (typeFilter === "all" ? items : items.filter((item) => item.type === typeFilter)),
    [items, typeFilter],
  );

  return (
    <Modal title="Recent activity" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Type filter tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 16, borderRadius: "var(--dg-radius-md)", background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
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
                  borderColor: active ? "var(--color-brand)" : "var(--color-border)",
                  background: active ? "var(--color-brand)" : "transparent",
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
            <EmptyState compact heading="No activity matching filter" />
          ) : (
            filtered.map((item, i) => (
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
                    i < filtered.length - 1
                      ? "1px solid var(--color-border-light)"
                      : "none",
                }}
              >
                <ActivityIcon variant={item.iconVariant} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.35 }}>
                    {item.description}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 3 }}>
                    {item.relativeTime}
                  </div>
                </div>
              </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };

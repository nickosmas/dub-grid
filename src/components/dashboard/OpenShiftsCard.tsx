import type { OpenShift } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

const BADGE_STYLES: Record<OpenShift["urgency"], { bg: string; color: string; border: string; label: string }> = {
  high: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Urgent" },
  medium: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Open" },
  low: { bg: "#F0FDF4", color: "#166534", border: "#BBF7D0", label: "Open" },
};

interface OpenShiftsCardProps {
  openShifts: OpenShift[];
  maxVisible?: number;
  onExpand?: () => void;
}

export default function OpenShiftsCard({
  openShifts,
  maxVisible = 5,
  onExpand,
}: OpenShiftsCardProps) {
  const visible = openShifts.slice(0, maxVisible);

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Open shifts
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 1 }}>
            {openShifts.length} unfilled this week
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {openShifts.length > maxVisible && (
            <a
              href="/schedule"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary, #2D6B3A)", cursor: "pointer", textDecoration: "none" }}
            >
              View all &rarr;
            </a>
          )}
          {onExpand && <ExpandButton onClick={onExpand} label="Expand open shifts" />}
        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {openShifts.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center", padding: "20px 0" }}>
            All shifts covered this week
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visible.map((shift) => {
              const badge = BADGE_STYLES[shift.urgency];
              return (
                <div
                  key={shift.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--color-bg, #F8FAFC)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  {/* Date block */}
                  <div style={{ textAlign: "center", minWidth: 34 }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-subtle)", fontWeight: 500 }}>
                      {shift.dayOfWeek}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
                      {shift.dayOfMonth}
                    </div>
                  </div>

                  <div style={{ width: 1, height: 36, background: "var(--color-border)" }} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {shift.shiftCodeLabel}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-subtle)", marginTop: 1 }}>
                      {shift.focusAreaName}
                      {shift.timeRange && ` \u00B7 ${shift.timeRange}`}
                      {shift.needed > 1 && ` \u00B7 ${shift.needed} needed`}
                    </div>
                  </div>

                  {/* Badge */}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 5,
                      background: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
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

import type { OpenShift } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

const BADGE_STYLES: Record<OpenShift["urgency"], { bg: string; color: string; border: string; label: string }> = {
  high: { bg: "var(--color-danger-bg)", color: "var(--color-danger)", border: "var(--color-danger-border)", label: "Urgent" },
  medium: { bg: "var(--color-warning-bg)", color: "var(--color-warning)", border: "var(--color-warning-border)", label: "Open" },
  low: { bg: "var(--color-success-bg)", color: "var(--color-success-text)", border: "var(--color-success-border)", label: "Open" },
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
    <div className="dg-card">
      {/* Header */}
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">
            Open shifts
          </div>
          <div className="dg-card-subtitle">
            {openShifts.length} unfilled this week
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {openShifts.length > maxVisible && (
            <a
              href="/schedule"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", cursor: "pointer", textDecoration: "none" }}
            >
              View all &rarr;
            </a>
          )}
          {onExpand && <ExpandButton onClick={onExpand} label="Expand open shifts" />}
        </div>
      </div>

      <div className="dg-card-body">
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
                    background: "var(--color-bg)",
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

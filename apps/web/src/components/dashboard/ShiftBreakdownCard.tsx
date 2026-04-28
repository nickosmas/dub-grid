import type { ShiftTypeBreakdown } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

interface ShiftBreakdownCardProps {
  breakdown: ShiftTypeBreakdown;
  onExpand?: () => void;
}

export default function ShiftBreakdownCard({
  breakdown,
  onExpand,
}: ShiftBreakdownCardProps) {
  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">
            Shift breakdown
          </div>
          <div className="dg-card-subtitle">
            {breakdown.totalShifts} total shifts this week
          </div>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} label="Expand shift breakdown" />}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {breakdown.totalShifts === 0 ? (
          <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center" }}>
            No shifts this week
          </div>
        ) : (
          breakdown.byFocusArea.map((fa, i) => (
            <div
              key={fa.focusAreaId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 18px",
                borderBottom:
                  i < breakdown.byFocusArea.length - 1
                    ? "1px solid var(--color-bg)"
                    : "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {fa.focusAreaName}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  {fa.codes.map((c) => (
                    <div key={c.assignmentId} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--color-text-subtle)", flexShrink: 0, opacity: 0.5 }} />
                      <span style={{ fontSize: 10, color: "var(--color-text-subtle)" }}>
                        {c.assignmentLabel}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>
                        {c.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Count + percentage */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>
                  {fa.total}
                </div>
                <div style={{ fontSize: 10, color: "var(--color-text-subtle)", fontFamily: "var(--font-dm-mono), 'DM Mono', monospace" }}>
                  {breakdown.totalShifts > 0 ? Math.round((fa.total / breakdown.totalShifts) * 100) : 0}%
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

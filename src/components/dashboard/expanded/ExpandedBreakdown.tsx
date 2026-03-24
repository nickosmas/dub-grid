import type { ShiftTypeBreakdown, FocusAreaBreakdown } from "@/lib/dashboard-stats";
import DonutChart from "../DonutChart";
import Modal from "@/components/Modal";

interface ExpandedBreakdownProps {
  breakdown: ShiftTypeBreakdown;
  onClose: () => void;
}

export default function ExpandedBreakdown({ breakdown, onClose }: ExpandedBreakdownProps) {
  return (
    <Modal title="Shift breakdown" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Summary */}
        <div style={{ fontSize: 13, color: "var(--color-text-subtle)" }}>
          {breakdown.totalShifts} total shifts across {breakdown.byFocusArea.length} section{breakdown.byFocusArea.length !== 1 ? "s" : ""}
        </div>

        {/* Grid of focus area donuts */}
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {breakdown.byFocusArea.length === 0 ? (
            <div style={emptyStyle}>No shifts this week</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 20,
              }}
            >
              {breakdown.byFocusArea.map((fa) => (
                <FocusAreaCard key={fa.focusAreaId} fa={fa} totalShifts={breakdown.totalShifts} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FocusAreaCard({ fa, totalShifts }: { fa: FocusAreaBreakdown; totalShifts: number }) {
  const segments = fa.codes.map((c) => ({
    label: c.shiftCodeLabel,
    value: c.count,
    color: c.color,
  }));

  const pct = totalShifts > 0 ? Math.round((fa.total / totalShifts) * 100) : 0;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: fa.colorBg,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", flex: 1 }}>
          {fa.focusAreaName}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {fa.total}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
          ({pct}%)
        </span>
      </div>

      {/* Donut + legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <DonutChart
          segments={segments}
          size={100}
          strokeWidth={16}
          centerLabel={String(fa.total)}
          centerSubLabel="shifts"
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {fa.codes.map((c) => {
            const codePct = fa.total > 0 ? Math.round((c.count / fa.total) * 100) : 0;
            return (
              <div key={c.shiftCodeId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: c.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    flex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={c.shiftCodeLabel}
                >
                  {c.shiftCodeLabel}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", flexShrink: 0 }}>
                  {c.count}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-text-subtle)", flexShrink: 0, minWidth: 30, textAlign: "right" }}>
                  {codePct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const modalStyle = { maxWidth: 900, width: "90vw" };

const cardStyle = {
  padding: 16,
  borderRadius: 8,
  background: "var(--color-bg, #F8FAFC)",
  border: "1px solid var(--color-border)",
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};

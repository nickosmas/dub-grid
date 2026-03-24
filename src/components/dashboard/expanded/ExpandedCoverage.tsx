import React, { useState, useMemo } from "react";
import type { SectionCoverage } from "@/lib/dashboard-stats";
import type { FocusArea } from "@/types";
import Modal from "@/components/Modal";

const STATUS_COLORS = {
  green: { bg: "#C6E0CB", text: "#1A4A25" },
  amber: { bg: "#FDE68A", text: "#92400E" },
  red: { bg: "#FECACA", text: "#B91C1C" },
};

const PCT_COLORS = {
  green: "#2D6B3A",
  amber: "#D97706",
  red: "#DC2626",
};

interface ExpandedCoverageProps {
  sections: SectionCoverage[];
  focusAreas: FocusArea[];
  focusAreaLabel: string;
  onClose: () => void;
}

export default function ExpandedCoverage({
  sections,
  focusAreas,
  focusAreaLabel,
  onClose,
}: ExpandedCoverageProps) {
  const [filter, setFilter] = useState<"all" | number>("all");

  const filtered = useMemo(
    () => (filter === "all" ? sections : sections.filter((s) => s.focusAreaId === filter)),
    [sections, filter],
  );

  // Summary stats
  const totalFilled = sections.reduce((s, sec) => s + sec.filledTotal, 0);
  const totalRequired = sections.reduce((s, sec) => s + sec.requiredTotal, 0);
  const overallPct = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 100;

  return (
    <Modal title={`Coverage by ${focusAreaLabel.toLowerCase()}`} onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Summary + filter row */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={summaryBadgeStyle}>
            <span style={{ fontWeight: 700, color: PCT_COLORS[overallPct >= 90 ? "green" : overallPct >= 70 ? "amber" : "red"] }}>
              {overallPct}%
            </span>
            <span style={{ color: "var(--color-text-subtle)" }}>overall</span>
          </div>
          <div style={summaryBadgeStyle}>
            <span style={{ fontWeight: 700 }}>{totalFilled}</span>
            <span style={{ color: "var(--color-text-subtle)" }}>/ {totalRequired} filled</span>
          </div>
          <select
            value={filter === "all" ? "all" : String(filter)}
            onChange={(e) => setFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{ ...selectStyle, marginLeft: "auto" }}
          >
            <option value="all">All sections</option>
            {focusAreas.map((fa) => (
              <option key={fa.id} value={fa.id}>{fa.name}</option>
            ))}
          </select>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={emptyStyle}>No coverage data for this filter</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Coverage bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {filtered.map((sec) => {
                  const pctColor = sec.pct >= 90 ? "green" : sec.pct >= 70 ? "amber" : "red";
                  return (
                    <div key={sec.focusAreaId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: sec.colorBg,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                            {sec.focusAreaName}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
                            {sec.filledTotal} / {sec.requiredTotal} filled
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: PCT_COLORS[pctColor] }}>
                            {sec.pct}%
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 8, background: "var(--color-border)", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 4,
                            width: `${Math.min(100, sec.pct)}%`,
                            background: PCT_COLORS[pctColor],
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Heatmap */}
              {filtered.length > 0 && filtered[0].daily.length > 0 && (
                <div>
                  <div style={heatmapLabelStyle}>Day-by-day staffing</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `100px repeat(${filtered[0].daily.length}, 1fr)`,
                      gap: 4,
                      overflowX: "auto",
                    }}
                  >
                    {/* Header row */}
                    <div />
                    {filtered[0].daily.map((d) => (
                      <div key={d.dateKey} style={heatmapHeaderStyle}>
                        {d.dayLabel}
                      </div>
                    ))}

                    {/* Data rows */}
                    {filtered.map((sec) => (
                      <React.Fragment key={sec.focusAreaId}>
                        <div style={heatmapRowLabelStyle}>
                          {sec.focusAreaName}
                        </div>
                        {sec.daily.map((day) => {
                          const colors = STATUS_COLORS[day.status];
                          return (
                            <div
                              key={`${sec.focusAreaId}-${day.dateKey}`}
                              style={{
                                height: 32,
                                borderRadius: 5,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 600,
                                background: colors.bg,
                                color: colors.text,
                              }}
                              title={`${sec.focusAreaName} - ${day.dayLabel}: ${day.staffCount} staff`}
                            >
                              {day.staffCount}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 900, width: "90vw" };

const summaryBadgeStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 5,
  fontSize: 13,
  padding: "6px 12px",
  borderRadius: 8,
  background: "var(--color-bg, #F8FAFC)",
  border: "1px solid var(--color-border)",
};

const selectStyle = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  cursor: "pointer" as const,
};

const heatmapLabelStyle = {
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--color-text-subtle)",
  marginBottom: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const heatmapHeaderStyle = {
  fontSize: 10,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  fontWeight: 500,
  padding: "2px 0",
};

const heatmapRowLabelStyle = {
  fontSize: 11,
  color: "var(--color-text-subtle)",
  textAlign: "right" as const,
  paddingRight: 8,
  lineHeight: "32px",
  whiteSpace: "nowrap" as const,
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};

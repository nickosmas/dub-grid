import React from "react";
import type { SectionCoverage } from "@/lib/dashboard-stats";
import ExpandButton from "./ExpandButton";

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

interface CoverageBySectionCardProps {
  sections: SectionCoverage[];
  focusAreaLabel: string;
  isMobile: boolean;
  hasRequirements: boolean;
  onExpand?: () => void;
}

export default function CoverageBySectionCard({
  sections,
  focusAreaLabel,
  isMobile,
  hasRequirements,
  onExpand,
}: CoverageBySectionCardProps) {
  if (sections.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>Coverage by {focusAreaLabel.toLowerCase()}</div>
            <div style={subStyle}>
              {hasRequirements
                ? "All sections fully covered this week"
                : "No coverage requirements configured"}
            </div>
          </div>
          {!hasRequirements && (
            <a
              href="/settings/coverage"
              style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary, #2D6B3A)", cursor: "pointer", textDecoration: "none" }}
            >
              Configure &rarr;
            </a>
          )}
        </div>
        {!hasRequirements && (
          <div style={{ padding: "20px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-subtle)", lineHeight: 1.6 }}>
              Set up coverage requirements in Settings to track
              <br />
              how well each {focusAreaLabel.toLowerCase()} is staffed.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>Coverage by {focusAreaLabel.toLowerCase()}</div>
          <div style={subStyle}>This week &middot; required vs scheduled</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href="/schedule"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary, #2D6B3A)", cursor: "pointer", textDecoration: "none" }}
          >
            See schedule &rarr;
          </a>
          {onExpand && <ExpandButton onClick={onExpand} label="Expand coverage" />}
        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {/* Coverage bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sections.map((sec) => {
            const pctColor = sec.pct >= 90 ? "green" : sec.pct >= 70 ? "amber" : "red";
            return (
              <div key={sec.focusAreaId} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                    {sec.focusAreaName}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-subtle)" }}>
                      {sec.filledTotal} / {sec.requiredTotal} filled
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: PCT_COLORS[pctColor] }}>
                      {sec.pct}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--color-border)", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
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

        {/* Day-by-day heatmap */}
        {sections.length > 0 && sections[0].daily.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-subtle)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Day-by-day staffing
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `80px repeat(${sections[0].daily.length}, 1fr)`,
                gap: 4,
                overflowX: isMobile ? "auto" : undefined,
              }}
            >
              {/* Header row */}
              <div />
              {sections[0].daily.map((d) => (
                <div
                  key={d.dateKey}
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-subtle)",
                    textAlign: "center",
                    fontWeight: 500,
                    padding: "2px 0",
                  }}
                >
                  {d.dayLabel}
                </div>
              ))}

              {/* Data rows */}
              {sections.map((sec) => (
                <React.Fragment key={sec.focusAreaId}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-subtle)",
                      textAlign: "right",
                      paddingRight: 8,
                      lineHeight: "28px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {sec.focusAreaName}
                  </div>
                  {sec.daily.map((day) => {
                    const colors = STATUS_COLORS[day.status];
                    return (
                      <div
                        key={`${sec.focusAreaId}-${day.dateKey}`}
                        style={{
                          height: 28,
                          borderRadius: 5,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 600,
                          background: colors.bg,
                          color: colors.text,
                          cursor: "default",
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

const titleStyle = { fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" };
const subStyle = { fontSize: 11, color: "var(--color-text-subtle)", marginTop: 1 };
